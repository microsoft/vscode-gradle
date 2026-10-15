import * as vscode from "vscode";
import * as util from "util";
import * as net from "net";
import * as getPort from "get-port";
import { isTest } from "../util";
import { logger, LoggerStream, LogVerbosity } from "../logger";
import { Output } from "../proto/gradle_pb";
import { GradleRpcError, isUnknown } from "../transport/jsonrpc";
import { RootProject } from "../rootProject/RootProject";
import { COMMAND_CANCEL_BUILD } from "../commands";
import { GradleTaskDefinition } from "../tasks";
import { TaskServerClient } from "../client";
import { getBuildInvocationCancellationKey } from "../client/CancellationKeys";
import { toolOptionsProviders } from "../api";

const NL = "\n";
const CR = "\r";
const nlRegExp = new RegExp(`${NL}([^${CR}]|$)`, "g");

export class GradleRunnerTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    private stdOutLoggerStream: LoggerStream | undefined;
    private readonly closeEmitter = new vscode.EventEmitter<number>();
    private task?: vscode.Task;
    private javaDebug?: {
        port: number;
        output: Map<number, string>;
        connection?: net.Socket;
        retry?: NodeJS.Timeout;
    };
    private closed = false;
    private readonly invocationCancellationKey: string;
    public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    public readonly onDidClose: vscode.Event<number> = this.closeEmitter.event;

    constructor(
        private readonly rootProject: RootProject,
        private readonly args: string[],
        private readonly cancellationKey: string,
        private readonly client: TaskServerClient
    ) {
        this.invocationCancellationKey = getBuildInvocationCancellationKey(cancellationKey);
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
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.stopJavaDebugWait();
        await vscode.commands.executeCommand(COMMAND_CANCEL_BUILD, this.invocationCancellationKey, this.task);
    }

    private stopJavaDebugWait(): void {
        const javaDebug = this.javaDebug;
        this.javaDebug = undefined;
        if (javaDebug?.retry) {
            clearTimeout(javaDebug.retry);
        }
        javaDebug?.connection?.destroy();
    }

    private probeJavaDebugPort(): void {
        const javaDebug = this.javaDebug;
        if (!javaDebug) {
            return;
        }
        javaDebug.retry = undefined;
        const connection = net.connect(javaDebug.port, "localhost");
        javaDebug.connection = connection;
        let connected = false;
        connection.once("connect", () => {
            connected = true;
            connection.destroy();
        });
        connection.on("error", (err: NodeJS.ErrnoException) => {
            if (
                this.javaDebug === javaDebug &&
                err.code !== "ECONNREFUSED" &&
                err.code !== "ECONNRESET" &&
                err.code !== "ETIMEDOUT"
            ) {
                this.failJavaDebug(err);
            }
            connection.destroy();
        });
        connection.once("timeout", () => connection.destroy());
        connection.once("close", () => {
            javaDebug.connection = undefined;
            if (this.javaDebug !== javaDebug) {
                return;
            }
            if (connected) {
                this.attachJavaDebug();
            } else {
                javaDebug.retry = setTimeout(() => this.probeJavaDebugPort(), 500);
            }
        });
        connection.setTimeout(1000);
    }

    private attachJavaDebug(): void {
        const javaDebug = this.javaDebug;
        if (!javaDebug || this.closed) {
            return;
        }
        this.stopJavaDebugWait();
        this.startJavaDebug(javaDebug.port).catch((err: unknown) => this.failJavaDebug(err));
    }

    private failJavaDebug(err: unknown): void {
        if (this.closed) {
            return;
        }
        this.handleJavaDebugError(err);
        this.close().catch((cancelError: unknown) => {
            logger.error(
                "Unable to cancel Gradle task:",
                cancelError instanceof Error ? cancelError.message : String(cancelError)
            );
        });
    }

    private async startJavaDebug(javaDebugPort: number): Promise<void> {
        const definition = this.task?.definition as GradleTaskDefinition;
        const debugConfig = {
            type: "java",
            name: "Debug (Attach) via Gradle Tasks",
            request: "attach",
            hostName: "localhost",
            port: javaDebugPort,
            projectName: definition?.project,
        };
        const startedDebugging = await vscode.debug.startDebugging(this.rootProject.getWorkspaceFolder(), debugConfig);
        if (!startedDebugging) {
            throw new Error("The debugger was not started");
        }
    }

    private handleJavaDebugOutput(message: string, outputType: number): void {
        const javaDebug = this.javaDebug;
        if (!javaDebug) {
            return;
        }
        const output = (javaDebug.output.get(outputType) ?? "") + message;
        const readyPattern = new RegExp(
            `Listening for transport dt_socket at address: (?:\\S+:)?${javaDebug.port}[ \\t]*(?:\\r|\\n)`
        );
        if (readyPattern.test(util.stripVTControlCharacters(output))) {
            this.attachJavaDebug();
        } else {
            // Retain a bounded suffix so readiness messages can span output chunks.
            javaDebug.output.set(outputType, output.slice(-512));
        }
    }

    private handleJavaDebugError(err: unknown): void {
        const errorMessage = "Unable to start Java debugging: " + (err instanceof Error ? err.message : String(err));
        logger.error(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
    }

    private async runBuild(): Promise<void> {
        const javaDebugEnabled = this.task ? this.task.definition.javaDebug : false;

        try {
            if (this.closed) {
                this.closeEmitter.fire(0);
                return;
            }
            await this.client.runBuild(
                this.rootProject.getProjectUri().fsPath,
                this.cancellationKey,
                this.args,
                "",
                0,
                this.task,
                this.handleOutput,
                true,
                "",
                undefined,
                undefined,
                {
                    cancellationKey: this.invocationCancellationKey,
                    onCancellationRequested: () => {
                        this.closed = true;
                        this.stopJavaDebugWait();
                    },
                    prepare: async (token) => {
                        const javaDebugPort = javaDebugEnabled ? await getPort() : 0;
                        if (token.isCancellationRequested) {
                            throw new vscode.CancellationError();
                        }
                        if (javaDebugEnabled) {
                            this.javaDebug = { port: javaDebugPort, output: new Map<number, string>() };
                        }
                        const additionalToolOptions = (
                            await Promise.all(toolOptionsProviders.map((provider) => provider.resolveToolOptions()))
                        ).join(" ");
                        if (token.isCancellationRequested) {
                            throw new vscode.CancellationError();
                        }
                        this.probeJavaDebugPort();
                        return { javaDebugPort, additionalToolOptions };
                    },
                }
            );
            if (this.javaDebug) {
                this.stopJavaDebugWait();
                this.handleJavaDebugError(new Error("The task completed without the debugger being attached"));
            }
            this.closeEmitter.fire(0);
        } catch (e) {
            this.handleError(e);
            this.closeEmitter.fire(1);
        } finally {
            this.closed = true;
            this.stopJavaDebugWait();
        }
    }

    private handleOutput = (output: Output): void => {
        const messageBytes = output.getOutputBytes_asU8();
        if (messageBytes.length) {
            if (isTest() && this.stdOutLoggerStream) {
                this.stdOutLoggerStream.write(messageBytes);
            }
            const message = new util.TextDecoder("utf-8").decode(messageBytes);
            this.write(message);
            this.handleJavaDebugOutput(message, output.getOutputType());
        }
    };

    private handleError(err: unknown): void {
        if (isUnknown(err)) {
            const outputChannel = logger.getChannel();
            if (outputChannel) {
                this.write(
                    `Unable to run Gradle Task due to server error. View the "${outputChannel.name}" output for details.`
                );
            }
        } else if (err instanceof Error) {
            const tagged = err as GradleRpcError;
            this.write(tagged.details || tagged.message);
        } else {
            this.write(String(err));
        }
    }

    public async handleInput(data: string): Promise<void> {
        // sigint eg cmd/ctrl+C
        if (data === "\x03") {
            await this.close();
        }
    }

    private write(message: string): void {
        // Note writing `\n` will just move the cursor down 1 row.
        // We need to write `\r` as well to move the cursor to the left-most cell.
        const sanitisedMessage = message.replace(nlRegExp, `${NL + CR}$1`);
        this.writeEmitter.fire(sanitisedMessage);
    }
}
