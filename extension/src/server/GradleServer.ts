import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";
import * as kill from "tree-kill";
import type { Logger as JsonRpcLogger, MessageConnection } from "vscode-jsonrpc";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { getGradleServerCommand, getGradleServerEnv, quoteArg } from "./serverUtil";
import { Logger } from "../logger/index";
import { NO_JAVA_EXECUTABLE, INSTALL_JDK } from "../constant";
import { extensionInstalled } from "../util/config";
import { BspProxy } from "../bs/BspProxy";
import { getRandomPipeName } from "../util/generateRandomPipeName";
import { createPipeListener, PipeListener } from "../transport/jsonrpc";
import { shouldAutoRestart } from "./autoRestartPolicy";
const SERVER_LOGLEVEL_REGEX = /^\[([A-Z]+)\](.*)$/;
const DOWNLOAD_PROGRESS_CHAR = ".";
const STDERR_TAIL_LINES = 40;
const STDERR_TAIL_PREVIEW_LINES = 3;
const VIEW_LOG_ACTION = "View Log";
const RESTART_GRADLE_SERVER_ACTION = "Restart Gradle Server";
// Bounded auto-restart for unexpected gradle-server exits (e.g. a task
// transport break that kills the JVM). Relaunch transparently instead of
// immediately asking the user to reload, and only fall back to the warning
// once the retry budget is exhausted. The budget is per session (not reset on
// recovery) to keep this conservative; a future refinement could reset it on a
// successful reconnect.
const MAX_AUTO_RESTARTS = 3;
const AUTO_RESTART_DELAY_MS = 1_000;

export class GradleServer {
    private readonly _onDidStart: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private readonly _onDidStop: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private ready = false;
    private starting = false;
    private processRunning = false;
    private pipeListener: PipeListener | undefined;
    private restarting = false;
    private languageServerInitializer: (pipePath: string) => Promise<void> = async () => undefined;
    public readonly onDidStart: vscode.Event<null> = this._onDidStart.event;
    public readonly onDidStop: vscode.Event<null> = this._onDidStop.event;
    private process?: cp.ChildProcessWithoutNullStreams;
    private languageServerPipePath = "";
    private bspProxy: BspProxy;
    private processStartedAt = 0;
    private stderrTail: string[] = [];
    private pendingStderrLine = "";
    private disposing = false;
    private autoRestartCount = 0;
    private autoRestartTimer: NodeJS.Timeout | undefined;
    private restartMessagePromise: Promise<void> | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger,
        private readonly transportLogger: Logger
    ) {
        this.bspProxy = new BspProxy(this.context, logger);
    }

    /** Adapt the project Logger to the {@link JsonRpcLogger} shape (single-arg methods). */
    private buildJsonRpcLogger(): JsonRpcLogger {
        return {
            error: (message: string) => this.transportLogger.error(message),
            warn: (message: string) => this.transportLogger.warn(message),
            info: (message: string) => this.transportLogger.info(message),
            log: (message: string) => this.transportLogger.info(message),
        };
    }

    private setLanguageServerPipePath(): void {
        this.languageServerPipePath = getRandomPipeName();
        if (this.languageServerPipePath === "") {
            this.logger.error("Gradle language server will not start due to pipe path generation failure");
        }
    }

    public setLanguageServerInitializer(initializer: (pipePath: string) => Promise<void>): void {
        this.languageServerInitializer = initializer;
    }

    public async start(): Promise<void> {
        if (this.starting || this.processRunning) {
            return;
        }
        this.starting = true;
        // Cancel any pending auto-restart so an explicit start()/restart()
        // never races with a scheduled relaunch into a double-spawn.
        if (this.autoRestartTimer) {
            clearTimeout(this.autoRestartTimer);
            this.autoRestartTimer = undefined;
        }
        this.ready = false;
        try {
            let startBuildServer = false;
            if (extensionInstalled("redhat.java")) {
                const isPrepared = this.bspProxy.prepareToStart();
                if (isPrepared) {
                    startBuildServer = true;
                } else {
                    this.logger.error("Gradle build server will not start due to pipe path generation failure");
                }
            }
            this.bspProxy.setBuildServerStarted(startBuildServer);
            this.bspProxy.start();
            const cwd = this.context.asAbsolutePath("lib");
            const cmd = path.join(cwd, getGradleServerCommand());
            const env = await getGradleServerEnv();
            if (!env) {
                sendInfo("", {
                    kind: "GradleServerEnvMissing",
                });
                const choice = extensionInstalled("vscjava.vscode-java-pack") ? [INSTALL_JDK] : [];
                vscode.window.showErrorMessage(NO_JAVA_EXECUTABLE, ...choice).then((selection) => {
                    if (selection === INSTALL_JDK) {
                        vscode.commands.executeCommand("java.installJdk");
                    }
                });
                return;
            }
            this.setLanguageServerPipePath();
            try {
                await this.languageServerInitializer(this.languageServerPipePath);
            } catch (error) {
                this.logger.error(
                    `Gradle language server pipe initialization failed: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                this.languageServerPipePath = "";
            }
            // The JVM connects back as a named-pipe / UDS client over JSON-RPC.
            // Bind the pipe BEFORE spawning the JVM so the JVM never sees a
            // connection race against our listener. The listener is created AFTER
            // the env check so we don't leak a bound pipe + pending connect promise
            // on the no-Java path.
            this.pipeListener?.dispose();
            this.pipeListener = await createPipeListener({ logger: this.buildJsonRpcLogger() });
            const taskServerPipePath = this.pipeListener.pipePath;
            const args = [
                quoteArg(`--pipe=${taskServerPipePath}`),
                quoteArg(`--startBuildServer=${startBuildServer}`),
                quoteArg(`--languageServerPipePath=${this.languageServerPipePath}`),
            ];
            if (startBuildServer) {
                const buildServerPipeName = this.bspProxy.getBuildServerPipeName();
                const bundleDirectory = this.context.asAbsolutePath("server");
                args.push(quoteArg(`--pipeName=${buildServerPipeName}`));
                args.push(quoteArg(`--bundleDir=${bundleDirectory}`));
            }
            this.logger.debug(`Gradle Server cmd: ${cmd} ${args.join(" ")}`);

            this.processStartedAt = Date.now();
            this.stderrTail = [];
            this.pendingStderrLine = "";
            this.process = cp.spawn(`"${cmd}"`, args, {
                cwd,
                env,
                shell: true,
            });
            this.processRunning = true;
            this.process.stdout.on("data", this.logOutput);
            this.process.stderr.on("data", this.logOutput);
            this.process.stderr.on("data", this.captureStderrTail);
            this.process
                .on("error", (err: Error) => this.logger.error(err.message))
                .on("exit", async (code, signal) => {
                    this.flushPendingStderrLine();
                    const wasTaskTransportReady = this.ready;
                    const durationMs = Date.now() - this.processStartedAt;
                    this.logger.warn(
                        `Gradle server stopped (exitCode=${code ?? "null"}, signal=${
                            signal ?? "none"
                        }, durationMs=${durationMs})`
                    );
                    if (this.stderrTail.length > 0) {
                        this.logger.warn("Gradle server stderr tail:");
                        for (const line of this.stderrTail) {
                            this.logger.warn(`  ${line}`);
                        }
                    }
                    this._onDidStop.fire(null);
                    this.ready = false;
                    this.processRunning = false;
                    this.process?.removeAllListeners();
                    this.process = undefined;
                    this.pipeListener?.dispose();
                    this.pipeListener = undefined;
                    this.bspProxy.closeConnection();
                    if (this.restarting) {
                        this.restarting = false;
                        await this.start();
                        return;
                    }
                    if ((code !== null && code !== 0) || signal !== null) {
                        // Decide on recovery first, then record a single
                        // serverProcessExit event for every unexpected exit (kept
                        // comparable to the historical baseline). autoRestartAttempt
                        // carries the recovery outcome on the same event: "1".."N"
                        // while self-healing, "" once we give up (budget exhausted
                        // or disposing) and the user is prompted.
                        const willAutoRestart = wasTaskTransportReady && this.tryAutoRestart(code, signal);
                        sendInfo("", {
                            kind: "serverProcessExit",
                            data3: code !== null ? code.toString() : "",
                            dataMsg: signal ?? "",
                            autoRestartAttempt: willAutoRestart ? this.autoRestartCount.toString() : "",
                            transport: "pipe",
                        });
                        if (willAutoRestart) {
                            return;
                        }
                        await this.handleUnexpectedExit(code, signal);
                    }
                });

            this.fireOnStart();
        } catch (error) {
            this.pipeListener?.dispose();
            this.pipeListener = undefined;
            this.processRunning = false;
            throw error;
        } finally {
            this.starting = false;
        }
    }

    public isReady(): boolean {
        return this.ready;
    }

    public isStarted(): boolean {
        return this.starting || this.processRunning || this.autoRestartTimer !== undefined;
    }

    public isProcessRunning(): boolean {
        return this.processRunning;
    }

    public async showRestartMessage(reason?: string): Promise<void> {
        if (this.restartMessagePromise) {
            return this.restartMessagePromise;
        }
        this.restartMessagePromise = this.showRestartMessageOnce(reason).finally(() => {
            this.restartMessagePromise = undefined;
        });
        return this.restartMessagePromise;
    }

    private async showRestartMessageOnce(reason?: string): Promise<void> {
        const message = reason
            ? `${reason} Restart the Gradle server?`
            : "No connection to Gradle server. Restart the Gradle server?";
        const selection = await vscode.window.showErrorMessage(message, RESTART_GRADLE_SERVER_ACTION);
        sendInfo("", {
            kind: "serverProcessExitRestart",
            data3: selection === RESTART_GRADLE_SERVER_ACTION ? "true" : "false",
            dataMsg: "gradleServer",
        });
        if (selection === RESTART_GRADLE_SERVER_ACTION) {
            await this.restart();
        }
    }

    public async restart(): Promise<void> {
        this.logger.info("Restarting gradle server");
        this.ready = false;
        if (this.processRunning && this.process) {
            this.restarting = true;
            await this.killProcess();
            return;
        }
        this.restarting = false;
        await this.start();
    }

    private captureStderrTail = (data: Buffer | string): void => {
        const text = this.pendingStderrLine + (typeof data === "string" ? data : data.toString());
        const lines = text.split(/\r?\n/);
        // The last element is either an incomplete line (no trailing newline)
        // or an empty string (chunk ended on a newline). Either way it cannot
        // be pushed yet; keep it for the next chunk.
        this.pendingStderrLine = lines.pop() ?? "";
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                continue;
            }
            this.stderrTail.push(line);
            if (this.stderrTail.length > STDERR_TAIL_LINES) {
                this.stderrTail.shift();
            }
        }
    };

    private flushPendingStderrLine(): void {
        const line = this.pendingStderrLine.trim();
        this.pendingStderrLine = "";
        if (!line) {
            return;
        }
        this.stderrTail.push(line);
        if (this.stderrTail.length > STDERR_TAIL_LINES) {
            this.stderrTail.shift();
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private logOutput = (data: any): void => {
        const str = data.toString().trim();
        if (!str || str === DOWNLOAD_PROGRESS_CHAR) {
            return;
        }
        const logLevelMatches = str.match(SERVER_LOGLEVEL_REGEX);
        if (logLevelMatches && logLevelMatches.length) {
            const [, serverLogLevel, serverLogMessage] = logLevelMatches;
            const logLevel = serverLogLevel.toLowerCase() as "debug" | "info" | "warn" | "error";
            this.logger[logLevel](serverLogMessage.trim());
        } else {
            this.logger.info(str);
        }
    };

    private async killProcess(): Promise<void> {
        if (this.process) {
            return new Promise((resolve) => {
                if (this.process?.pid) {
                    kill(this.process.pid, () => resolve());
                } else {
                    resolve();
                }
            });
        }
    }

    /**
     * Transparently relaunch the gradle-server after an unexpected exit, up to
     * {@link MAX_AUTO_RESTARTS} times, so a transient transport failure
     * self-heals instead of forcing the user to reload the window. Returns
     * `true` if a restart was scheduled (caller must not show the
     * unexpected-exit warning); `false` if the retry budget is exhausted or the
     * server is being disposed. The exit itself (and the resulting attempt
     * number) is reported by the caller on the serverProcessExit event.
     */
    private tryAutoRestart(code: number | null, signal: NodeJS.Signals | null): boolean {
        if (!shouldAutoRestart(this.disposing, this.autoRestartCount, MAX_AUTO_RESTARTS)) {
            return false;
        }
        this.autoRestartCount += 1;
        this.logger.warn(
            `Gradle server exited unexpectedly; auto-restarting (attempt ${this.autoRestartCount}/${MAX_AUTO_RESTARTS}) in ${AUTO_RESTART_DELAY_MS}ms`
        );
        this.autoRestartTimer = setTimeout(() => {
            this.autoRestartTimer = undefined;
            this.start().catch((error) => {
                // The relaunch itself failed (e.g. the pipe listener could not
                // bind). Fall back to the normal unexpected-exit handling so the
                // user still gets the recovery prompt instead of being left with
                // a silently dead server.
                this.logger.error(
                    `Gradle server auto-restart failed: ${error instanceof Error ? error.message : String(error)}`
                );
                void this.handleUnexpectedExit(code, signal);
            });
        }, AUTO_RESTART_DELAY_MS);
        return true;
    }

    /** True while an auto-restart is scheduled but not yet completed. Lets the
     * client suppress its manual "reconnect" prompts so they don't compete with
     * the transparent relaunch. */
    public isAutoRestartPending(): boolean {
        return this.autoRestartTimer !== undefined;
    }

    private async handleUnexpectedExit(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
        const reason = signal
            ? `was terminated by signal ${signal}`
            : `exited unexpectedly with code ${code ?? "null"}`;
        const tailPreview = this.stderrTail.slice(-STDERR_TAIL_PREVIEW_LINES).join(" | ");
        const detail = tailPreview
            ? `Last output: ${tailPreview}`
            : `See the "Gradle for Java" output channel for details.`;
        const message = `Gradle server ${reason}. ${detail}`;
        const selection = await vscode.window.showWarningMessage(
            message,
            RESTART_GRADLE_SERVER_ACTION,
            VIEW_LOG_ACTION
        );
        if (selection === RESTART_GRADLE_SERVER_ACTION) {
            sendInfo("", {
                kind: "serverProcessExitRestart",
                data3: "true",
                dataMsg: "gradleServer",
            });
            await this.restart();
        } else if (selection === VIEW_LOG_ACTION) {
            this.logger.getChannel()?.show(true);
        }
    }

    private fireOnStart(): void {
        this._onDidStart.fire(null);
    }

    public async asyncDispose(): Promise<void> {
        this.disposing = true;
        if (this.autoRestartTimer) {
            clearTimeout(this.autoRestartTimer);
            this.autoRestartTimer = undefined;
        }
        this.bspProxy.closeConnection();
        this.process?.removeAllListeners();
        await this.killProcess();
        this.pipeListener?.dispose();
        this.pipeListener = undefined;
        this.ready = false;
        this.processRunning = false;
        this.process = undefined;
        this._onDidStart.dispose();
        this._onDidStop.dispose();
    }

    public awaitTaskConnection(): Promise<MessageConnection> {
        if (!this.pipeListener) {
            return Promise.reject(new Error("Gradle task server pipe listener is not initialized."));
        }
        return this.pipeListener.connection.then((connection) => {
            this.ready = true;
            return connection;
        });
    }
}
