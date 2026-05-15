import * as vscode from "vscode";
import * as util from "util";
import * as getPort from "get-port";
import { isTest, waitOnTcp } from "../util";
import { logger, LoggerStream, LogVerbosity } from "../logger";
import { Output } from "../proto/gradle_pb";
import { ServiceError, status } from "@grpc/grpc-js";
import { RootProject } from "../rootProject/RootProject";
import { isTaskRunning } from "../tasks/taskUtil";
import { COMMAND_CANCEL_BUILD } from "../commands";
import { GradleTaskDefinition } from "../tasks";
import { TaskServerClient } from "../client";
import { toolOptionsProviders } from "../api";
import { getConfigTaskExecutionMode } from "../util/config";
import {
    DirectBuildCancelledError,
    DirectBuildError,
    findGradleWrapper,
    runDirectBuild,
} from "../tasks/DirectTaskExecutor";

const NL = "\n";
const CR = "\r";
const nlRegExp = new RegExp(`${NL}([^${CR}]|$)`, "g");

export class GradleRunnerTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    private stdOutLoggerStream: LoggerStream | undefined;
    private readonly closeEmitter = new vscode.EventEmitter<number>();
    private task?: vscode.Task;
    public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    public readonly onDidClose: vscode.Event<number> = this.closeEmitter.event;

    constructor(
        private readonly rootProject: RootProject,
        private readonly args: string[],
        private readonly cancellationKey: string,
        private readonly client: TaskServerClient
    ) {
        if (isTest()) {
            // TODO: this is only needed for the tests. Find a better way to test task output in the tests.
            this.stdOutLoggerStream = new LoggerStream(logger, LogVerbosity.INFO);
        }
    }

    public async open(): Promise<void> {
        await this.runBuild();
    }

    public setTask(task: vscode.Task): void {
        this.task = task;
    }

    public async close(): Promise<void> {
        if (this.task && isTaskRunning(this.task)) {
            await this.cancelCommand();
        }
    }

    private startJavaDebug(javaDebugPort: number): void {
        // To accommodate scenarios where debugging is bypassed due to Gradle build cache
        const closePromise = new Promise((_resolve, reject) => {
            const disposable = this.onDidClose(() => {
                disposable.dispose();
                reject(new Error("The task completed without the debugger being attached"));
            });
        });
        Promise.race([waitOnTcp("localhost", javaDebugPort), closePromise]).then(
            async () => {
                const definition = this.task?.definition as GradleTaskDefinition;
                const projectName = definition ? definition.project : undefined;
                const debugConfig = {
                    type: "java",
                    name: "Debug (Attach) via Gradle Tasks",
                    request: "attach",
                    hostName: "localhost",
                    port: javaDebugPort,
                    projectName,
                };
                const startedDebugging = await vscode.debug.startDebugging(
                    this.rootProject.getWorkspaceFolder(),
                    debugConfig
                );
                if (!startedDebugging) {
                    throw new Error("The debugger was not started");
                }
            },
            (err) => {
                const errorMessage = "Unable to start Java debugging: " + err.message;
                logger.error(errorMessage);
                vscode.window.showErrorMessage(errorMessage);
                this.close();
            }
        );
    }

    private async runBuild(): Promise<void> {
        const javaDebugEnabled = this.task ? this.task.definition.javaDebug : false;

        try {
            const javaDebugPort = javaDebugEnabled ? await getPort() : 0;
            if (javaDebugEnabled) {
                this.startJavaDebug(javaDebugPort);
            }
            const additionalToolOptions = (
                await Promise.all(toolOptionsProviders.map((provider) => provider.resolveToolOptions()))
            ).join(" ");

            const useDirect = await this.shouldUseDirectExecution();
            if (useDirect) {
                await this.runDirect(javaDebugPort, additionalToolOptions);
            } else {
                const runTask = this.client.runBuild(
                    this.rootProject.getProjectUri().fsPath,
                    this.cancellationKey,
                    this.args,
                    "",
                    javaDebugPort,
                    this.task,
                    this.handleOutput,
                    true,
                    additionalToolOptions
                );
                await runTask;
            }
            this.closeEmitter.fire(0);
        } catch (e) {
            this.handleError(e);
            this.closeEmitter.fire(1);
        }
    }

    private async shouldUseDirectExecution(): Promise<boolean> {
        if (getConfigTaskExecutionMode() !== "direct") {
            return false;
        }
        const wrapperPath = await findGradleWrapper(this.rootProject.getProjectUri().fsPath);
        if (!wrapperPath) {
            this.write(
                `> "gradle.taskExecution" is set to "direct" but no Gradle wrapper was found at ${
                    this.rootProject.getProjectUri().fsPath
                }; falling back to the Gradle server.\n`
            );
            logger.warn(
                `[direct] no wrapper at ${this.rootProject.getProjectUri().fsPath}; falling back to gRPC runBuild`
            );
            return false;
        }
        return true;
    }

    private async runDirect(javaDebugPort: number, additionalToolOptions: string): Promise<void> {
        const projectFolder = this.rootProject.getProjectUri().fsPath;
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: "Gradle",
                cancellable: true,
            },
            async (_progress, token: vscode.CancellationToken) => {
                const tokenSub = token.onCancellationRequested(() =>
                    vscode.commands.executeCommand(COMMAND_CANCEL_BUILD, this.cancellationKey, this.task)
                );
                try {
                    logger.info(`[direct] start: ${this.args.join(" ")} (cwd=${projectFolder})`);
                    await runDirectBuild({
                        rootProject: this.rootProject,
                        cancellationKey: this.cancellationKey,
                        args: this.args,
                        javaDebugPort,
                        additionalToolOptions,
                        showOutputColors: true,
                        task: this.task,
                        onOutput: (text: string) => this.handleDirectOutput(text),
                        onQueued: () => this.write(`> Waiting for a direct Gradle execution slot…\n`),
                    });
                    logger.info(`[direct] complete: ${this.args.join(" ")}`);
                } finally {
                    tokenSub.dispose();
                }
            }
        );
    }

    private handleDirectOutput(text: string): void {
        if (!text) {
            return;
        }
        if (isTest() && this.stdOutLoggerStream) {
            this.stdOutLoggerStream.write(Buffer.from(text, "utf8"));
        }
        this.write(text);
    }

    private async cancelCommand(): Promise<void> {
        await vscode.commands.executeCommand(COMMAND_CANCEL_BUILD, this.cancellationKey, this.task);
    }

    private handleOutput = (output: Output): void => {
        const messageBytes = output.getOutputBytes_asU8();
        if (messageBytes.length) {
            if (isTest() && this.stdOutLoggerStream) {
                this.stdOutLoggerStream.write(messageBytes);
            }
            this.write(new util.TextDecoder("utf-8").decode(messageBytes));
        }
    };

    private handleError(err: ServiceError | DirectBuildError | DirectBuildCancelledError | Error): void {
        if (err instanceof DirectBuildCancelledError) {
            this.write(`Build cancelled\n`);
            return;
        }
        if (err instanceof DirectBuildError) {
            this.write(`${err.message}\n`);
            return;
        }
        const serviceErr = err as ServiceError;
        if (typeof serviceErr.code === "number" && serviceErr.code === status.UNKNOWN) {
            const outputChannel = logger.getChannel();
            if (outputChannel) {
                this.write(
                    `Unable to run Gradle Task due to server error. View the "${outputChannel.name}" output for details.`
                );
            }
        } else {
            this.write(serviceErr.details || err.message);
        }
    }

    public async handleInput(data: string): Promise<void> {
        // sigint eg cmd/ctrl+C
        if (data === "\x03") {
            await this.cancelCommand();
        }
    }

    private write(message: string): void {
        // Note writing `\n` will just move the cursor down 1 row.
        // We need to write `\r` as well to move the cursor to the left-most cell.
        const sanitisedMessage = message.replace(nlRegExp, `${NL + CR}$1`);
        this.writeEmitter.fire(sanitisedMessage);
    }
}
