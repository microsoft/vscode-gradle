import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";
import * as kill from "tree-kill";
import { commands } from "vscode";
import type { Logger as JsonRpcLogger, MessageConnection } from "vscode-jsonrpc";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { getGradleServerCommand, getGradleServerEnv, quoteArg } from "./serverUtil";
import { Logger } from "../logger/index";
import { NO_JAVA_EXECUTABLE, OPT_RESTART, INSTALL_JDK } from "../constant";
import { extensionInstalled, getEnvJavaMajorVersion, REQUIRED_JDK_VERSION } from "../util/config";
import { getMajorVersion } from "../util/jdkUtils";
import { BspProxy } from "../bs/BspProxy";
import { getRandomPipeName } from "../util/generateRandomPipeName";
import { createPipeListener, PipeListener } from "../transport/jsonrpc";
import { shouldAutoRestart } from "./autoRestartPolicy";
import { buildServerProcessExitInfo, classifyServerStderr, JavaSource } from "./serverProcessExitInfo";
const SERVER_LOGLEVEL_REGEX = /^\[([A-Z]+)\](.*)$/;
const DOWNLOAD_PROGRESS_CHAR = ".";
const STDERR_TAIL_LINES = 40;
const STDERR_TAIL_PREVIEW_LINES = 3;
const VIEW_LOG_ACTION = "View Log";
const RELOAD_HINT = "Run 'Developer: Reload Window' if Gradle stops working.";
// Bounded auto-restart for unexpected gradle-server process exits. Task
// transport disconnects are handled by the in-JVM reconnect loop and should not
// normally reach this path.
const MAX_AUTO_RESTARTS = 3;
const AUTO_RESTART_DELAY_MS = 1_000;

export class GradleServer {
    private readonly _onDidStart: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private readonly _onDidStop: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private ready = false;
    private pipeListener: PipeListener | undefined;
    private restarting = false;
    public readonly onDidStart: vscode.Event<null> = this._onDidStart.event;
    public readonly onDidStop: vscode.Event<null> = this._onDidStop.event;
    private process?: cp.ChildProcessWithoutNullStreams;
    private languageServerPipePath: string;
    private bspProxy: BspProxy;
    private processStartedAt = 0;
    private stderrTail: string[] = [];
    private pendingStderrLine = "";
    private disposing = false;
    private autoRestartCount = 0;
    private autoRestartTimer: NodeJS.Timeout | undefined;
    // Startup diagnostics for the most recent spawn, surfaced on serverProcessExit
    // so an unexpected exit (notably code=1 before connecting) can be attributed
    // to the resolved JDK in field telemetry.
    private resolvedJavaMajor = 0;
    private resolvedJavaSource: JavaSource = "unknown";
    private connectedBeforeExit = false;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger,
        private readonly transportLogger: Logger
    ) {
        this.setLanguageServerPipePath();
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

    /**
     * Resolve and record which JDK the launcher will use, so a later
     * unexpected exit can be attributed. Logs to the output channel (full
     * detail) and emits a low-cardinality `gradleServerJavaResolved` telemetry
     * event. The `pathFallback` source and any version below
     * {@link REQUIRED_JDK_VERSION} are called out explicitly because they
     * directly explain a startup `code=1`.
     */
    private async logResolvedJava(javaHome: string | undefined, javaSource: JavaSource): Promise<void> {
        let javaMajor = 0;
        if (javaHome) {
            javaMajor = await getMajorVersion(javaHome);
        } else if (javaSource === "pathFallback") {
            // No VSCODE_JAVA_HOME was set; probe the JAVA_HOME/PATH java the
            // launcher will actually use.
            javaMajor = getEnvJavaMajorVersion();
        }
        this.resolvedJavaMajor = javaMajor;
        this.resolvedJavaSource = javaSource;
        this.logger.info(
            `Gradle server JDK resolved: source=${javaSource}, major=${javaMajor || "unknown"}, home=${
                javaHome ?? "(JAVA_HOME/PATH)"
            }`
        );
        if (javaSource === "pathFallback") {
            this.logger.warn(
                "No validated JDK >= 17 was found; falling back to JAVA_HOME/PATH 'java'. If that Java is older than 17 the gradle-server will exit with code 1 before connecting."
            );
        }
        if (javaMajor > 0 && javaMajor < REQUIRED_JDK_VERSION) {
            this.logger.error(
                `Resolved Java major version ${javaMajor} is below the required ${REQUIRED_JDK_VERSION}; the gradle-server jar is compiled for Java ${REQUIRED_JDK_VERSION} and will exit with code 1.`
            );
        }
        sendInfo("", {
            kind: "gradleServerJavaResolved",
            dataMsg: JSON.stringify({
                javaSource,
                javaMajor,
                belowRequired: javaMajor > 0 && javaMajor < REQUIRED_JDK_VERSION,
            }),
        });
    }

    private setLanguageServerPipePath(): void {
        this.languageServerPipePath = getRandomPipeName();
        if (this.languageServerPipePath === "") {
            this.logger.error("Gradle language server will not start due to pipe path generation failure");
        }
    }

    public getLanguageServerPipePath(): string {
        return this.languageServerPipePath;
    }
    public async start(): Promise<void> {
        // Cancel any pending auto-restart so an explicit start()/restart()
        // never races with a scheduled relaunch into a double-spawn.
        if (this.autoRestartTimer) {
            clearTimeout(this.autoRestartTimer);
            this.autoRestartTimer = undefined;
        }
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
        const serverEnv = await getGradleServerEnv();
        if (!serverEnv) {
            this.logger.error(
                "Gradle server will not start: no Java executable could be resolved (no Red Hat embedded JRE, no JDK>=17, and no 'java' on PATH)"
            );
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
        const { env, javaHome, javaSource } = serverEnv;
        await this.logResolvedJava(javaHome, javaSource);
        // The JVM connects back as a named-pipe / UDS client over JSON-RPC.
        // Bind the pipe BEFORE spawning the JVM so the JVM never sees a
        // connection race against our listener. The listener is created AFTER
        // the env check so we don't leak a bound pipe + pending connect promise
        // on the no-Java path.
        this.pipeListener?.dispose();
        this.pipeListener = await createPipeListener({ logger: this.buildJsonRpcLogger() });
        this.connectedBeforeExit = false;
        this.pipeListener.onConnection(() => {
            if (!this.connectedBeforeExit) {
                this.connectedBeforeExit = true;
                this.logger.debug("Gradle server connected to the task pipe");
            }
        });
        const taskServerPipePath = this.pipeListener.pipePath;
        const args = [
            quoteArg(`--pipe=${taskServerPipePath}`),
            quoteArg(`--parentPid=${process.pid}`),
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
        this.process.stdout.on("data", this.logOutput);
        this.process.stderr.on("data", this.logOutput);
        this.process.stderr.on("data", this.captureStderrTail);
        this.process
            .on("error", (err: Error) => {
                this.logger.error(err.message);
                this.cleanupProcessState();
            })
            // Use 'close' rather than 'exit': 'close' is emitted only after the
            // process has ended AND its stdio streams have drained, so the
            // stderr line that explains a startup code=1 (e.g.
            // UnsupportedClassVersionError or "Could not create the Java Virtual
            // Machine") is guaranteed to be captured before we classify it.
            // 'exit' can fire while that final stderr chunk is still buffered.
            .on("close", async (code, signal) => {
                this.flushPendingStderrLine();
                const durationMs = Date.now() - this.processStartedAt;
                const stderrSignature = classifyServerStderr(this.stderrTail);
                this.logger.warn(
                    `Gradle server stopped (exitCode=${code ?? "null"}, signal=${
                        signal ?? "none"
                    }, durationMs=${durationMs}, connected=${this.connectedBeforeExit}, javaSource=${
                        this.resolvedJavaSource
                    }, javaMajor=${this.resolvedJavaMajor || "unknown"}, stderr=${stderrSignature})`
                );
                if (this.stderrTail.length > 0) {
                    this.logger.warn("Gradle server stderr tail:");
                    for (const line of this.stderrTail) {
                        this.logger.warn(`  ${line}`);
                    }
                }
                this.cleanupProcessState();
                if (this.restarting) {
                    this.restarting = false;
                    await this.start();
                    return;
                }
                if ((code !== null && code !== 0) || signal !== null) {
                    // Decide on recovery first, then record a single
                    // serverProcessExit event for every unexpected exit (kept
                    // comparable to the historical baseline). The exit code,
                    // signal and recovery outcome are JSON-encoded into dataMsg
                    // because the telemetry sink only persists kind and dataMsg;
                    // the exit code previously lived in data3 and was dropped, so
                    // unexpected exits could not be attributed. The startup
                    // diagnostics (duration, whether the JVM connected, resolved
                    // JDK source/version, classified stderr) let us split a
                    // before-connect code=1 (incompatible JDK) from other exits.
                    // None of these fields carry user data.
                    const willAutoRestart = this.tryAutoRestart(code, signal);
                    sendInfo("", {
                        kind: "serverProcessExit",
                        dataMsg: JSON.stringify(
                            buildServerProcessExitInfo(code, signal, willAutoRestart ? this.autoRestartCount : 0, {
                                durationMs,
                                connected: this.connectedBeforeExit,
                                javaMajor: this.resolvedJavaMajor,
                                javaSource: this.resolvedJavaSource,
                                stderrSignature,
                            })
                        ),
                        transport: "pipe",
                    });
                    if (willAutoRestart) {
                        return;
                    }
                    await this.handleUnexpectedExit(code, signal);
                }
            });

        this.fireOnStart();
    }

    public isReady(): boolean {
        return this.ready;
    }

    public isStarted(): boolean {
        return this.process !== undefined;
    }

    public handleTaskConnectionClosed(): void {
        this.ready = false;
    }

    public async showRestartMessage(): Promise<void> {
        const selection = await vscode.window.showErrorMessage(
            "No connection to gradle server. Try restarting the server.",
            OPT_RESTART
        );
        sendInfo("", {
            kind: "serverProcessExitRestart",
            // Encode the choice in dataMsg; the telemetry sink only persists
            // kind and dataMsg, so the boolean would be dropped if sent in data3.
            dataMsg: JSON.stringify({ restartChosen: selection === OPT_RESTART }),
        });
        if (selection === OPT_RESTART) {
            await commands.executeCommand("workbench.action.restartExtensionHost");
        }
    }

    public async restart(): Promise<void> {
        this.logger.info("Restarting gradle server");
        this.restarting = true;
        this.killProcess();
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

    private cleanupProcessState(): void {
        this._onDidStop.fire(null);
        this.ready = false;
        this.process?.removeAllListeners();
        this.process = undefined;
        this.pipeListener?.dispose();
        this.pipeListener = undefined;
        this.bspProxy.closeConnection();
    }

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
        const message = `Gradle server ${reason}. ${detail} ${RELOAD_HINT}`;
        const selection = await vscode.window.showWarningMessage(message, VIEW_LOG_ACTION);
        if (selection === VIEW_LOG_ACTION) {
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
        this._onDidStart.dispose();
        this._onDidStop.dispose();
    }

    public awaitTaskConnection(): Promise<MessageConnection> {
        if (!this.pipeListener) {
            return Promise.reject(new Error("Gradle task server pipe listener is not initialized."));
        }
        return this.pipeListener.waitForConnection().then((connection) => {
            this.ready = true;
            return connection;
        });
    }
}
