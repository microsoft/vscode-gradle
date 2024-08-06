import * as vscode from "vscode";
import * as grpc from "@grpc/grpc-js";
import { connectivityState as ConnectivityState } from "@grpc/grpc-js";

import {
    Output,
    GetBuildRequest,
    GetBuildReply,
    Cancelled,
    GradleBuild,
    Environment,
    GradleConfig,
    RunBuildRequest,
    RunBuildReply,
    CancelBuildRequest,
    CancelBuildReply,
    CancelBuildsRequest,
    CancelBuildsReply,
    ExecuteCommandRequest,
    ExecuteCommandReply,
} from "../proto/gradle_pb";

import { GradleClient as GrpcClient } from "../proto/gradle_grpc_pb";
import { logger, LoggerStream, LogVerbosity, Logger } from "../logger";
import { GradleServer } from "../server";
import { ProgressHandler } from "../progress";
import { removeCancellingTask, restartQueuedTask } from "../tasks/taskUtil";
import { COMMAND_REFRESH_DAEMON_STATUS, COMMAND_SHOW_LOGS, COMMAND_CANCEL_BUILD } from "../commands";
import { RootProject } from "../rootProject/RootProject";
import { getBuildCancellationKey } from "./CancellationKeys";
import { EventWaiter } from "../util/EventWaiter";
import { getGradleConfig, getJavaDebugCleanOutput } from "../util/config";
import { setDefault, unsetDefault } from "../views/defaultProject/DefaultProjectUtils";
import { SpecifySourcePackageNameStep } from "../createProject/SpecifySourcePackageNameStep";

function logBuildEnvironment(environment: Environment): void {
    const javaEnv = environment.getJavaEnvironment()!;
    const gradleEnv = environment.getGradleEnvironment()!;
    logger.info("Java Home:", javaEnv.getJavaHome());
    logger.info("JVM Args:", javaEnv.getJvmArgsList().join(","));
    logger.info("Gradle User Home:", gradleEnv.getGradleUserHome());
    logger.info("Gradle Version:", gradleEnv.getGradleVersion());
}

export class TaskServerClient implements vscode.Disposable {
    private readonly connectDeadline = 30; // seconds
    private grpcClient: GrpcClient | null = null;
    private readonly _onDidConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private readonly _onDidConnectFail: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    public readonly onDidConnect: vscode.Event<null> = this._onDidConnect.event;
    public readonly onDidConnectFail: vscode.Event<null> = this._onDidConnectFail.event;

    private readonly waitForConnect = new EventWaiter(this.onDidConnect).wait;

    public constructor(
        private readonly server: GradleServer,
        private readonly statusBarItem: vscode.StatusBarItem,
        private readonly clientLogger: Logger
    ) {
        this.server.onDidStart(this.handleServerStart);
        this.server.onDidStop(this.handleServerStop);
    }

    private handleServerStop = (): void => {
        this.close();
    };

    public handleServerStart = (): Thenable<void> => {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: "Gradle",
                cancellable: false,
            },
            (progress: vscode.Progress<{ message?: string }>) => {
                progress.report({ message: "Connecting" });
                return new Promise((resolve) => {
                    const disposableConnectHandler = this.onDidConnect(() => {
                        disposableConnectHandler.dispose();
                        resolve();
                    });
                    const disposableConnectFailHandler = this.onDidConnectFail(() => {
                        disposableConnectFailHandler.dispose();
                        resolve();
                    });
                    this.connectToServer();
                });
            }
        );
    };

    public handleClientReady = async (err: Error | undefined): Promise<void> => {
        if (err) {
            await this.handleConnectError(err);
        } else {
            logger.info("Gradle client connected to server");
            this._onDidConnect.fire(null);
        }
    };

    private connectToServer(): void {
        try {
            this.grpcClient = new GrpcClient(`localhost:${this.server.getPort()}`, grpc.credentials.createInsecure(), {
                "grpc.enable_http_proxy": 0,
                "grpc.max_receive_message_length": -1,
            });
            grpc.setLogger(this.clientLogger);
            const deadline = new Date();
            deadline.setSeconds(deadline.getSeconds() + this.connectDeadline);
            this.grpcClient.waitForReady(deadline, this.handleClientReady);
        } catch (err) {
            logger.error("Unable to construct the gRPC client:", err.message);
            this.statusBarItem.hide();
        }
    }

    public async getBuild(
        rootProject: RootProject,
        gradleConfig: GradleConfig,
        showOutputColors = false
    ): Promise<GradleBuild | undefined> {
        await this.waitForConnect();
        this.statusBarItem.hide();
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: "Gradle",
                cancellable: true,
            },
            async (progress: vscode.Progress<{ message?: string }>, token: vscode.CancellationToken) => {
                const progressHandler = new ProgressHandler(progress, "Configure project");
                const cancellationKey = getBuildCancellationKey(rootProject.getProjectUri().fsPath);

                token.onCancellationRequested(() => this.cancelBuild(cancellationKey));

                const stdOutLoggerStream = new LoggerStream(logger, LogVerbosity.INFO);
                const stdErrLoggerStream = new LoggerStream(logger, LogVerbosity.ERROR);

                const request = new GetBuildRequest();
                request.setProjectDir(rootProject.getProjectUri().fsPath);
                request.setCancellationKey(cancellationKey);
                request.setGradleConfig(gradleConfig);
                request.setShowOutputColors(showOutputColors);
                const getBuildStream = this.grpcClient!.getBuild(request);
                try {
                    return await new Promise((resolve, reject) => {
                        let build: GradleBuild | undefined;
                        getBuildStream
                            .on("data", async (getBuildReply: GetBuildReply) => {
                                switch (getBuildReply.getKindCase()) {
                                    case GetBuildReply.KindCase.PROGRESS:
                                        progressHandler.report(getBuildReply.getProgress()!.getMessage().trim());
                                        break;
                                    case GetBuildReply.KindCase.OUTPUT:
                                        switch (getBuildReply.getOutput()!.getOutputType()) {
                                            case Output.OutputType.STDOUT:
                                                stdOutLoggerStream.write(
                                                    getBuildReply.getOutput()!.getOutputBytes_asU8()
                                                );
                                                break;
                                            case Output.OutputType.STDERR:
                                                stdErrLoggerStream.write(
                                                    getBuildReply.getOutput()!.getOutputBytes_asU8()
                                                );
                                                break;
                                        }
                                        break;
                                    case GetBuildReply.KindCase.CANCELLED:
                                        this.handleGetBuildCancelled(getBuildReply.getCancelled()!);
                                        break;
                                    case GetBuildReply.KindCase.GET_BUILD_RESULT:
                                        void unsetDefault();
                                        build = getBuildReply.getGetBuildResult()!.getBuild();
                                        break;
                                    case GetBuildReply.KindCase.ENVIRONMENT:
                                        const environment = getBuildReply.getEnvironment()!;
                                        rootProject.setEnvironment(environment);
                                        logBuildEnvironment(environment);
                                        await vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
                                        break;
                                    case GetBuildReply.KindCase.COMPATIBILITY_CHECK_ERROR:
                                        const message = getBuildReply.getCompatibilityCheckError()!;
                                        const options = ["Open Gradle Settings", "Learn More"];
                                        await vscode.window.showErrorMessage(message, ...options).then((choice) => {
                                            if (choice === "Open Gradle Settings") {
                                                void vscode.commands.executeCommand(
                                                    "workbench.action.openSettings",
                                                    "java.import.gradle"
                                                );
                                            } else if (choice === "Learn More") {
                                                void vscode.env.openExternal(
                                                    vscode.Uri.parse(
                                                        "https://docs.gradle.org/current/userguide/compatibility.html"
                                                    )
                                                );
                                            }
                                        });
                                        break;
                                }
                            })
                            .on("error", reject)
                            .on("end", () => resolve(build));
                    });
                } catch (err) {
                    void setDefault();
                    logger.error(
                        `Error getting build for ${rootProject.getProjectUri().fsPath}: ${err.details || err.message}`
                    );
                    this.statusBarItem.command = COMMAND_SHOW_LOGS;
                    this.statusBarItem.text = "$(warning) Gradle: Build Error";
                    this.statusBarItem.show();
                } finally {
                    process.nextTick(() => vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS));
                }
                return undefined;
            }
        );
    }

    public async runBuild(
        projectFolder: string,
        cancellationKey: string,
        args: ReadonlyArray<string>,
        input = "",
        javaDebugPort = 0,
        task?: vscode.Task,
        onOutput?: (output: Output) => void,
        showOutputColors = true,
        title?: string,
        location?: vscode.ProgressLocation
    ): Promise<void> {
        await this.waitForConnect();
        this.statusBarItem.hide();
        return vscode.window.withProgress(
            {
                location: location || vscode.ProgressLocation.Window,
                title: title || "Gradle",
                cancellable: true,
            },
            async (progress: vscode.Progress<{ message?: string }>, token: vscode.CancellationToken) => {
                token.onCancellationRequested(() =>
                    vscode.commands.executeCommand(COMMAND_CANCEL_BUILD, cancellationKey, task)
                );

                const progressHandler = new ProgressHandler(progress);
                progressHandler.onDidProgressStart(async () => {
                    await vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
                });

                const gradleConfig = getGradleConfig();
                const request = new RunBuildRequest();
                request.setProjectDir(projectFolder);
                request.setCancellationKey(cancellationKey);
                request.setArgsList(args as string[]);
                request.setGradleConfig(gradleConfig);
                request.setShowOutputColors(showOutputColors);
                request.setJavaDebugPort(javaDebugPort);
                request.setInput(input);

                if (javaDebugPort > 0) {
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectFolder));
                    if (workspaceFolder) {
                        request.setJavaDebugCleanOutputCache(getJavaDebugCleanOutput());
                    }
                }

                const runBuildStream = this.grpcClient!.runBuild(request);
                try {
                    await new Promise((resolve, reject) => {
                        runBuildStream
                            .on("data", (runBuildReply: RunBuildReply) => {
                                switch (runBuildReply.getKindCase()) {
                                    case RunBuildReply.KindCase.PROGRESS:
                                        progressHandler.report(runBuildReply.getProgress()!.getMessage().trim());
                                        break;
                                    case RunBuildReply.KindCase.OUTPUT:
                                        if (onOutput) {
                                            onOutput(runBuildReply.getOutput()!);
                                        }
                                        break;
                                    case RunBuildReply.KindCase.CANCELLED:
                                        this.handleRunBuildCancelled(args, runBuildReply.getCancelled()!, task);
                                        break;
                                }
                            })
                            .on("error", reject)
                            .on("end", resolve);
                    });
                    logger.info("Completed build:", args.join(" "));
                } catch (err) {
                    logger.error("Error running build:", `${args.join(" ")}:`, err.details || err.message);
                    throw err;
                } finally {
                    await vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
                    if (task) {
                        await restartQueuedTask(task);
                    }
                }
            }
        );
    }

    public async cancelBuild(cancellationKey: string, task?: vscode.Task): Promise<void> {
        await this.waitForConnect();
        this.statusBarItem.hide();
        const request = new CancelBuildRequest();
        request.setCancellationKey(cancellationKey);
        try {
            const reply: CancelBuildReply | undefined = await new Promise((resolve, reject) => {
                this.grpcClient!.cancelBuild(
                    request,
                    (err: grpc.ServiceError | null, cancelRunBuildReply: CancelBuildReply | undefined) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(cancelRunBuildReply);
                        }
                    }
                );
            });
            if (reply) {
                logger.info("Cancel build:", reply.getMessage());

                if (!reply.getBuildRunning() && task) {
                    removeCancellingTask(task);
                }
            }
        } catch (err) {
            logger.error("Error cancelling build:", err.details || err.message);
        }
    }

    public async cancelBuilds(): Promise<void> {
        this.statusBarItem.hide();
        const request = new CancelBuildsRequest();
        try {
            const reply: CancelBuildsReply | undefined = await new Promise((resolve, reject) => {
                this.grpcClient!.cancelBuilds(
                    request,
                    (err: grpc.ServiceError | null, cancelRunBuildsReply: CancelBuildsReply | undefined) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(cancelRunBuildsReply);
                        }
                    }
                );
            });
            if (reply) {
                logger.info("Cancel builds:", reply.getMessage());
            }
        } catch (err) {
            logger.error("Error cancelling builds:", err.details || err.message);
        }
    }

    public async getNormalizedPackageName(name: string): Promise<string | undefined> {
        await this.waitForConnect();
        const request = new ExecuteCommandRequest();
        request.setCommand(SpecifySourcePackageNameStep.GET_NORMALIZED_PACKAGE_NAME);
        request.addArguments(name);
        try {
            return await new Promise((resolve, reject) => {
                this.grpcClient!.executeCommand(
                    request,
                    (err: grpc.ServiceError | null, executeCommandReply: ExecuteCommandReply | undefined) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(executeCommandReply?.getResult());
                        }
                    }
                );
            });
        } catch (err) {
            return undefined;
        }
    }

    private handleRunBuildCancelled = (args: ReadonlyArray<string>, cancelled: Cancelled, task?: vscode.Task): void => {
        logger.info(`Build cancelled: ${args.join(" ")}: ${cancelled.getMessage()}`);
        if (task) {
            removeCancellingTask(task);
        }
    };

    private handleGetBuildCancelled = (cancelled: Cancelled): void => {
        logger.info("Build cancelled:", cancelled.getMessage());
    };

    private handleConnectError = async (e: Error): Promise<void> => {
        logger.error("Error connecting to gradle server:", e.message);
        this.close();
        this._onDidConnectFail.fire(null);
        if (this.server.isReady()) {
            const connectivityState = this.grpcClient!.getChannel().getConnectivityState(true);
            const enumKey = ConnectivityState[connectivityState];
            logger.error("The client has state:", enumKey);
            await this.showRestartMessage();
        } else {
            await this.server.showRestartMessage();
        }
    };

    public async showRestartMessage(): Promise<void> {
        const OPT_RESTART = "Re-connect Client";
        const input = await vscode.window.showErrorMessage(
            "The Gradle client was unable to connect. Try re-connecting.",
            OPT_RESTART
        );
        if (input === OPT_RESTART) {
            await this.handleServerStart();
        }
    }

    public close(): void {
        this.statusBarItem.hide();
        this.grpcClient?.close();
    }

    public dispose(): void {
        this.close();
        this._onDidConnect.dispose();
    }
}
