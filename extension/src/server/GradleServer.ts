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
import { extensionInstalled } from "../util/config";
import { BspProxy } from "../bs/BspProxy";
import { getRandomPipeName } from "../util/generateRandomPipeName";
import { createLoopbackListener, LoopbackListener } from "../transport/jsonrpc";
const SERVER_LOGLEVEL_REGEX = /^\[([A-Z]+)\](.*)$/;
const DOWNLOAD_PROGRESS_CHAR = ".";
const STDERR_TAIL_LINES = 40;
const STDERR_TAIL_PREVIEW_LINES = 3;
const VIEW_LOG_ACTION = "View Log";
const RELOAD_HINT = "Run 'Developer: Reload Window' if Gradle stops working.";

export interface ServerOptions {
    host: string;
}

export class GradleServer {
    private readonly _onDidStart: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private readonly _onDidStop: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private ready = false;
    private taskServerPort: number | undefined;
    private loopbackListener: LoopbackListener | undefined;
    private restarting = false;
    public readonly onDidStart: vscode.Event<null> = this._onDidStart.event;
    public readonly onDidStop: vscode.Event<null> = this._onDidStop.event;
    private process?: cp.ChildProcessWithoutNullStreams;
    private languageServerPipePath: string;
    private bspProxy: BspProxy;
    private processStartedAt = 0;
    private stderrTail: string[] = [];
    private pendingStderrLine = "";

    constructor(
        private readonly opts: ServerOptions,
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
        // PR 1 flipped the JVM into a TCP *client*: it dials the port the
        // extension picks and connects back over JSON-RPC. Bind the
        // ephemeral loopback port BEFORE spawning the JVM so the JVM
        // never sees a connection-refused race against our listener. The
        // listener is created AFTER the env check so we don't leak a
        // bound socket + pending connect promise on the no-Java path.
        this.loopbackListener?.dispose();
        this.loopbackListener = await createLoopbackListener({ logger: this.buildJsonRpcLogger() });
        this.taskServerPort = this.loopbackListener.port;
        const args = [
            quoteArg(`--port=${this.taskServerPort}`),
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
            .on("error", (err: Error) => this.logger.error(err.message))
            .on("exit", async (code, signal) => {
                this.flushPendingStderrLine();
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
                this.process?.removeAllListeners();
                this.loopbackListener?.dispose();
                this.loopbackListener = undefined;
                this.bspProxy.closeConnection();
                if (this.restarting) {
                    this.restarting = false;
                    await this.start();
                    return;
                }
                if ((code !== null && code !== 0) || signal !== null) {
                    await this.handleUnexpectedExit(code, signal);
                }
            });

        this.fireOnStart();
    }

    public isReady(): boolean {
        return this.ready;
    }

    public async showRestartMessage(): Promise<void> {
        const selection = await vscode.window.showErrorMessage(
            "No connection to gradle server. Try restarting the server.",
            OPT_RESTART
        );
        sendInfo("", {
            kind: "serverProcessExitRestart",
            data3: selection === OPT_RESTART ? "true" : "false",
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

    private async handleUnexpectedExit(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
        sendInfo("", {
            kind: "serverProcessExit",
            data3: code !== null ? code.toString() : "",
            dataMsg: signal ?? "",
        });
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
        this.ready = true;
        this._onDidStart.fire(null);
    }

    public async asyncDispose(): Promise<void> {
        this.bspProxy.closeConnection();
        this.process?.removeAllListeners();
        await this.killProcess();
        this.loopbackListener?.dispose();
        this.loopbackListener = undefined;
        this.ready = false;
        this._onDidStart.dispose();
        this._onDidStop.dispose();
    }

    public getPort(): number | undefined {
        return this.taskServerPort;
    }

    public awaitTaskConnection(): Promise<MessageConnection> {
        if (!this.loopbackListener) {
            return Promise.reject(new Error("Gradle task server loopback listener is not initialized."));
        }
        return this.loopbackListener.connection;
    }

    public getOpts(): ServerOptions {
        return this.opts;
    }
}
