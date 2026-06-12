import * as vscode from "vscode";

import {
    Output,
    DependencyItem,
    GetBuildRequest,
    GetBuildReply,
    GetProjectDependenciesRequest,
    Cancelled,
    GradleBuild,
    Environment,
    GradleConfig,
    RunBuildRequest,
    RunBuildReply,
    CancelBuildRequest,
    CancelBuildsRequest,
    ExecuteCommandRequest,
} from "../proto/gradle_pb";

import { logger, LoggerStream, LogVerbosity } from "../logger";
import { GradleServer } from "../server";
import { ProgressHandler } from "../progress";
import { removeCancellingTask, restartQueuedTask } from "../tasks/taskUtil";
import { COMMAND_REFRESH_DAEMON_STATUS, COMMAND_SHOW_LOGS, COMMAND_CANCEL_BUILD } from "../commands";
import { RootProject } from "../rootProject/RootProject";
import { getBuildCancellationKey, getProjectDependenciesCancellationKey } from "./CancellationKeys";
import { EventWaiter } from "../util/EventWaiter";
import { getGradleConfig, getJavaDebugCleanOutput } from "../util/config";
import { normalizeGradleProjectPath } from "../util/gradlePath";
import { setDefault, unsetDefault } from "../views/defaultProject/DefaultProjectUtils";
import { SpecifySourcePackageNameStep } from "../createProject/SpecifySourcePackageNameStep";
import { GradleJsonRpcClient, GradleRpcError, isCancelled, isNotFound } from "../transport/jsonrpc";

function logBuildEnvironment(environment: Environment): void {
    const javaEnv = environment.getJavaEnvironment()!;
    const gradleEnv = environment.getGradleEnvironment()!;
    logger.info("Java Home:", javaEnv.getJavaHome());
    logger.info("JVM Args:", javaEnv.getJvmArgsList().join(","));
    logger.info("Gradle User Home:", gradleEnv.getGradleUserHome());
    logger.info("Gradle Version:", gradleEnv.getGradleVersion());
}

function errorDetails(err: unknown): string {
    if (err instanceof Error) {
        const tagged = err as GradleRpcError;
        return tagged.details || err.message;
    }
    return String(err);
}

export class TaskServerClient implements vscode.Disposable {
    private rpcClient: GradleJsonRpcClient | null = null;
    private rpcClientClosedHandler: vscode.Disposable | undefined;
    private readonly cancelledProjectDependencies: Set<string> = new Set();
    private readonly _onDidConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private readonly _onDidConnectFail: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    public readonly onDidConnect: vscode.Event<null> = this._onDidConnect.event;
    public readonly onDidConnectFail: vscode.Event<null> = this._onDidConnectFail.event;

    private readonly connectWaiter = new EventWaiter(this.onDidConnect);

    public constructor(private readonly server: GradleServer, private readonly statusBarItem: vscode.StatusBarItem) {
        this.server.onDidStart(this.handleServerStart);
        this.server.onDidStop(this.handleServerStop);
    }

    private handleServerStop = (): void => {
        this.close();
    };

    public handleServerStart = (): Thenable<void> => {
        this.connectWaiter.reset();
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
                    void this.connectToServer();
                });
            }
        );
    };

    private async connectToServer(): Promise<void> {
        try {
            const connection = await this.server.awaitTaskConnection();
            this.rpcClient = new GradleJsonRpcClient(connection);
            // The task transport can die between gradle-server process exits
            // (peer reset, crash). Proactively tear down the stale client
            // so subsequent task loads don't write to a destroyed socket and
            // silently drop a project's tasks.
            this.rpcClientClosedHandler?.dispose();
            this.rpcClientClosedHandler = this.rpcClient.onClosed((err) => {
                if (err) {
                    logger.error(`Gradle client connection closed unexpectedly: ${errorDetails(err)}`);
                }
                this.close();
            });
            logger.info("Gradle client connected to server");
            this._onDidConnect.fire(null);
        } catch (err) {
            await this.handleConnectError(err instanceof Error ? err : new Error(String(err)));
        }
    }

    public async getBuild(
        rootProject: RootProject,
        gradleConfig: GradleConfig,
        showOutputColors = false
    ): Promise<GradleBuild | undefined> {
        await this.connectWaiter.wait();
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

                try {
                    return await this.runGetBuildStream(
                        rootProject,
                        cancellationKey,
                        gradleConfig,
                        showOutputColors,
                        progressHandler
                    );
                } catch (err) {
                    void setDefault();
                    logger.error(`Error getting build for ${rootProject.getProjectUri().fsPath}: ${errorDetails(err)}`);
                    this.statusBarItem.command = COMMAND_SHOW_LOGS;
                    this.statusBarItem.text = "$(warning) Gradle: Build Error";
                    this.statusBarItem.show();
                    return undefined;
                } finally {
                    process.nextTick(() => vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS));
                }
            }
        );
    }

    private async runGetBuildStream(
        rootProject: RootProject,
        cancellationKey: string,
        gradleConfig: GradleConfig,
        showOutputColors: boolean,
        progressHandler: ProgressHandler
    ): Promise<GradleBuild | undefined> {
        const stdOutLoggerStream = new LoggerStream(logger, LogVerbosity.INFO);
        const stdErrLoggerStream = new LoggerStream(logger, LogVerbosity.ERROR);

        const request = new GetBuildRequest();
        request.setProjectDir(rootProject.getProjectUri().fsPath);
        request.setCancellationKey(cancellationKey);
        request.setGradleConfig(gradleConfig);
        request.setShowOutputColors(showOutputColors);

        let build: GradleBuild | undefined;
        const handleReply = async (getBuildReply: GetBuildReply): Promise<void> => {
            switch (getBuildReply.getKindCase()) {
                case GetBuildReply.KindCase.PROGRESS:
                    progressHandler.report(getBuildReply.getProgress()!.getMessage().trim());
                    break;
                case GetBuildReply.KindCase.OUTPUT:
                    switch (getBuildReply.getOutput()!.getOutputType()) {
                        case Output.OutputType.STDOUT:
                            stdOutLoggerStream.write(getBuildReply.getOutput()!.getOutputBytes_asU8());
                            break;
                        case Output.OutputType.STDERR:
                            stdErrLoggerStream.write(getBuildReply.getOutput()!.getOutputBytes_asU8());
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
                case GetBuildReply.KindCase.ENVIRONMENT: {
                    const environment = getBuildReply.getEnvironment()!;
                    rootProject.setEnvironment(environment);
                    logBuildEnvironment(environment);
                    await vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
                    break;
                }
                case GetBuildReply.KindCase.COMPATIBILITY_CHECK_ERROR: {
                    const message = getBuildReply.getCompatibilityCheckError()!;
                    const options = ["Open Gradle Settings", "Learn More"];
                    await vscode.window.showErrorMessage(message, ...options).then((choice) => {
                        if (choice === "Open Gradle Settings") {
                            void vscode.commands.executeCommand("workbench.action.openSettings", "java.import.gradle");
                        } else if (choice === "Learn More") {
                            void vscode.env.openExternal(
                                vscode.Uri.parse("https://docs.gradle.org/current/userguide/compatibility.html")
                            );
                        }
                    });
                    break;
                }
            }
        };
        const terminalReply = await this.rpcClient!.getBuild(request, handleReply);
        if (terminalReply) {
            await handleReply(terminalReply);
        }
        return build;
    }

    public async getProjectDependencies(
        rootProject: RootProject,
        projectPath: string,
        gradleConfig: GradleConfig,
        showOutputColors = false
    ): Promise<DependencyItem | undefined> {
        await this.connectWaiter.wait();
        this.statusBarItem.hide();
        const normalizedProjectPath = normalizeGradleProjectPath(projectPath);
        const cancellationKey = getProjectDependenciesCancellationKey(
            rootProject.getProjectUri().fsPath,
            normalizedProjectPath
        );
        const request = new GetProjectDependenciesRequest();
        request.setProjectDir(rootProject.getProjectUri().fsPath);
        request.setProjectPath(normalizedProjectPath);
        request.setCancellationKey(cancellationKey);
        request.setGradleConfig(gradleConfig);
        request.setShowOutputColors(showOutputColors);

        try {
            const reply = await this.rpcClient!.getProjectDependencies(request);
            this.cancelledProjectDependencies.delete(cancellationKey);
            return reply?.getDependencyItem();
        } catch (err) {
            if (this.cancelledProjectDependencies.delete(cancellationKey)) {
                logger.info(`Getting dependencies for ${normalizedProjectPath} was cancelled.`);
                return undefined;
            }
            if (isNotFound(err)) {
                logger.info(`No Gradle project found for dependency path ${normalizedProjectPath}.`);
                return undefined;
            }
            logger.error(`Error getting dependencies for ${normalizedProjectPath}: ${errorDetails(err)}`);
            this.statusBarItem.command = COMMAND_SHOW_LOGS;
            this.statusBarItem.text = "$(warning) Gradle: Dependency Error";
            this.statusBarItem.show();
            return undefined;
        }
    }

    public async cancelProjectDependencies(cancellationKey: string): Promise<void> {
        this.cancelledProjectDependencies.add(cancellationKey);
        await this.cancelBuild(cancellationKey);
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
        additionalToolOptions = "",
        title?: string,
        location?: vscode.ProgressLocation
    ): Promise<void> {
        await this.connectWaiter.wait();
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
                request.setAdditionalToolOptions(additionalToolOptions);

                if (javaDebugPort > 0) {
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectFolder));
                    if (workspaceFolder) {
                        request.setJavaDebugCleanOutputCache(getJavaDebugCleanOutput());
                    }
                }

                try {
                    const handleReply = (runBuildReply: RunBuildReply): void => {
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
                    };
                    const terminalReply = await this.rpcClient!.runBuild(request, handleReply);
                    if (terminalReply) {
                        handleReply(terminalReply);
                    }
                    logger.info("Completed build:", args.join(" "));
                } catch (err) {
                    logger.error("Error running build:", `${args.join(" ")}:`, errorDetails(err));
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
        await this.connectWaiter.wait();
        this.statusBarItem.hide();
        const request = new CancelBuildRequest();
        request.setCancellationKey(cancellationKey);
        try {
            const reply = await this.rpcClient!.cancelBuild(request);
            if (reply) {
                logger.info("Cancel build:", reply.getMessage());

                if (!reply.getBuildRunning() && task) {
                    removeCancellingTask(task);
                }
            }
        } catch (err) {
            logger.error("Error cancelling build:", errorDetails(err));
        }
    }

    public async cancelBuilds(): Promise<void> {
        this.statusBarItem.hide();
        const request = new CancelBuildsRequest();
        try {
            const reply = await this.rpcClient!.cancelBuilds(request);
            if (reply) {
                logger.info("Cancel builds:", reply.getMessage());
            }
        } catch (err) {
            logger.error("Error cancelling builds:", errorDetails(err));
        }
    }

    public async getNormalizedPackageName(name: string): Promise<string | undefined> {
        await this.connectWaiter.wait();
        const request = new ExecuteCommandRequest();
        request.setCommand(SpecifySourcePackageNameStep.GET_NORMALIZED_PACKAGE_NAME);
        request.addArguments(name);
        try {
            const reply = await this.rpcClient!.executeCommand(request);
            return reply?.getResult();
        } catch (err) {
            if (isCancelled(err)) {
                logger.info(`getNormalizedPackageName cancelled for "${name}"`);
            }
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

    /**
     * Invoked when establishing the JSON-RPC connection to the task server fails
     * (e.g. the JVM exited before connecting back, or the pipe listener timed
     * out). If the server process never came up, hand off to the server-level
     * restart prompt; otherwise show the client-level reconnect prompt.
     */
    private handleConnectError = async (e: Error): Promise<void> => {
        logger.error("Error connecting to gradle server:", e.message);
        this.close();
        this._onDidConnectFail.fire(null);
        // An auto-restart is already scheduled; it will respawn the server and
        // the client will reconnect on the next onDidStart. Don't compete with
        // it by prompting the user to restart manually.
        if (this.server.isAutoRestartPending()) {
            return;
        }
        if (this.server.isReady()) {
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
        this.rpcClientClosedHandler?.dispose();
        this.rpcClientClosedHandler = undefined;
        this.rpcClient?.dispose();
        this.rpcClient = null;
    }

    public dispose(): void {
        this.close();
        this._onDidConnect.dispose();
        this._onDidConnectFail.dispose();
    }
}
