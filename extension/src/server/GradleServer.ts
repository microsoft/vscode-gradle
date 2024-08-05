import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";
import * as getPort from "get-port";
import * as kill from "tree-kill";
import { commands } from "vscode";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { getGradleServerCommand, getGradleServerEnv, quoteArg } from "./serverUtil";
import { Logger } from "../logger/index";
import { NO_JAVA_EXECUTABLE, OPT_RESTART } from "../constant";
import { redHatJavaInstalled } from "../util/config";
import { BspProxy } from "../bs/BspProxy";
import { getRandomPipeName } from "../util/generateRandomPipeName";
const SERVER_LOGLEVEL_REGEX = /^\[([A-Z]+)\](.*)$/;
const DOWNLOAD_PROGRESS_CHAR = ".";

export interface ServerOptions {
    host: string;
}

export class GradleServer {
    private readonly _onDidStart: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private readonly _onDidStop: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private ready = false;
    private taskServerPort: number | undefined;
    private restarting = false;
    public readonly onDidStart: vscode.Event<null> = this._onDidStart.event;
    public readonly onDidStop: vscode.Event<null> = this._onDidStop.event;
    private process?: cp.ChildProcessWithoutNullStreams;
    private languageServerPipePath: string;

    constructor(
        private readonly opts: ServerOptions,
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger,
        private bspProxy: BspProxy
    ) {
        this.setLanguageServerPipePath();
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
        if (redHatJavaInstalled()) {
            const isPrepared = this.bspProxy.prepareToStart();
            if (isPrepared) {
                startBuildServer = true;
            } else {
                this.logger.error("Gradle build server will not start due to pipe path generation failure");
            }
        }
        this.bspProxy.setBuildServerStarted(startBuildServer);

        this.taskServerPort = await getPort();
        const cwd = this.context.asAbsolutePath("lib");
        const cmd = path.join(cwd, getGradleServerCommand());
        const env = await getGradleServerEnv();
        const bundleDirectory = this.context.asAbsolutePath("server");
        if (!env) {
            sendInfo("", {
                kind: "GradleServerEnvMissing",
            });
            await vscode.window.showErrorMessage(NO_JAVA_EXECUTABLE);
            return;
        }
        const args = [
            quoteArg(`--port=${this.taskServerPort}`),
            quoteArg(`--startBuildServer=${startBuildServer}`),
            quoteArg(`--languageServerPipePath=${this.languageServerPipePath}`),
        ];
        if (startBuildServer) {
            const buildServerPipeName = this.bspProxy.getBuildServerPipeName();
            args.push(quoteArg(`--pipeName=${buildServerPipeName}`));
            args.push(quoteArg(`--bundleDir=${bundleDirectory}`));
        }
        this.logger.debug(`Gradle Server cmd: ${cmd} ${args.join(" ")}`);

        this.process = cp.spawn(`"${cmd}"`, args, {
            cwd,
            env,
            shell: true,
        });
        this.process.stdout.on("data", this.logOutput);
        this.process.stderr.on("data", this.logOutput);
        this.process
            .on("error", (err: Error) => this.logger.error(err.message))
            .on("exit", async (code) => {
                this.logger.warn("Gradle server stopped");
                this._onDidStop.fire(null);
                this.ready = false;
                this.process?.removeAllListeners();
                this.bspProxy.closeConnection();
                if (this.restarting) {
                    this.restarting = false;
                    await this.start();
                } else if (code !== 0) {
                    await this.handleServerStartError(code);
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
            data2: selection === OPT_RESTART ? "true" : "false",
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
            return new Promise((resolve, _reject) => {
                if (this.process?.pid) {
                    kill(this.process.pid, () => resolve);
                }
            });
        }
    }

    private async handleServerStartError(code: number | null): Promise<void> {
        sendInfo("", {
            kind: "serverProcessExit",
            data2: code ? code.toString() : "",
        });
        await this.showRestartMessage();
    }

    private fireOnStart(): void {
        this.ready = true;
        this._onDidStart.fire(null);
    }

    public async asyncDispose(): Promise<void> {
        this.bspProxy.closeConnection();
        this.process?.removeAllListeners();
        await this.killProcess();
        this.ready = false;
        this._onDidStart.dispose();
        this._onDidStop.dispose();
    }

    public getPort(): number | undefined {
        return this.taskServerPort;
    }

    public getOpts(): ServerOptions {
        return this.opts;
    }
}
