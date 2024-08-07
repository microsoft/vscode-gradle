import * as vscode from "vscode";
import { commands, window } from "vscode";
import { logger, LogVerbosity, Logger } from "./logger";
import { Api } from "./api";
import { TaskServerClient } from "./client";
import { GradleServer } from "./server";
import { Icons } from "./icons";
import { GradleDaemonsTreeDataProvider, RecentTasksTreeDataProvider, GradleTasksTreeDataProvider } from "./views";
import { PinnedTasksStore, RecentTasksStore, TaskTerminalsStore, RootProjectsStore } from "./stores";
import { GradleTaskProvider, GradleTaskManager, GradleTaskDefinition } from "./tasks";
import {
    GRADLE_TASKS_VIEW,
    GRADLE_DAEMONS_VIEW,
    RECENT_TASKS_VIEW,
    GRADLE_DEFAULT_PROJECTS_VIEW,
} from "./views/constants";
import { focusTaskInGradleTasksTree } from "./views/viewUtil";
import { COMMAND_RENDER_TASK, COMMAND_REFRESH } from "./commands";
import { Commands } from "./commands/Commands";
import { getConfigIsDebugEnabled, getConfigFocusTaskInExplorer, getAllowParallelRun } from "./util/config";
import { FileWatcher } from "./util/FileWatcher";
import { DependencyTreeItem } from "./views/gradleTasks/DependencyTreeItem";
import { GRADLE_DEPENDENCY_REVEAL } from "./views/gradleTasks/DependencyUtils";
import { GradleDependencyProvider } from "./dependencies/GradleDependencyProvider";
import { isLanguageServerStarted, startLanguageClientAndWaitForConnection } from "./languageServer/languageServer";
import { DefaultProjectsTreeDataProvider } from "./views/defaultProject/DefaultProjectsTreeDataProvider";
import {
    CompletionKinds,
    Context,
    GRADLE_BUILD_FILE_CHANGE,
    GRADLE_BUILD_FILE_OPEN,
    GRADLE_COMPLETION,
    GRADLE_PROPERTIES_FILE_CHANGE,
    VSCODE_TRIGGER_COMPLETION,
    OPT_RESTART,
} from "./constant";
import { instrumentOperation, sendInfo } from "vscode-extension-telemetry-wrapper";
import { GradleBuildContentProvider } from "./client/GradleBuildContentProvider";
import { BuildServerController } from "./bs/BuildServerController";
import { GradleTestRunner } from "./bs/GradleTestRunner";

export class Extension {
    private readonly taskServerClient: TaskServerClient;
    private readonly server: GradleServer;
    private readonly pinnedTasksStore: PinnedTasksStore;
    private readonly recentTasksStore: RecentTasksStore;
    private readonly taskTerminalsStore: TaskTerminalsStore;
    private readonly rootProjectsStore: RootProjectsStore;
    private readonly gradleBuildContentProvider: GradleBuildContentProvider;
    private readonly gradleTaskProvider: GradleTaskProvider;
    private readonly gradleDependencyProvider: GradleDependencyProvider;
    private readonly taskProvider: vscode.Disposable;
    private readonly gradleTaskManager: GradleTaskManager;
    private readonly icons: Icons;
    private readonly buildFileWatcher: FileWatcher;
    private readonly gradleWrapperWatcher: FileWatcher;
    private readonly gradleDaemonsTreeView: vscode.TreeView<vscode.TreeItem>;
    private readonly gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>;
    private readonly gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
    private readonly recentTasksTreeDataProvider: RecentTasksTreeDataProvider;
    private readonly recentTasksTreeView: vscode.TreeView<vscode.TreeItem>;
    private readonly gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;
    private readonly defaultProjectsTreeView: vscode.TreeView<vscode.TreeItem>;
    private readonly defaultProjectsTreeDataProvider: DefaultProjectsTreeDataProvider;
    private readonly api: Api;
    private readonly commands: Commands;
    private readonly _onDidTerminalOpen: vscode.EventEmitter<vscode.Terminal> =
        new vscode.EventEmitter<vscode.Terminal>();
    private readonly onDidTerminalOpen: vscode.Event<vscode.Terminal> = this._onDidTerminalOpen.event;
    private recentTerminal: vscode.Terminal | undefined;
    private readonly buildServerController: BuildServerController;
    public constructor(private readonly context: vscode.ExtensionContext) {
        const loggingChannel = vscode.window.createOutputChannel("Gradle for Java");
        logger.setLoggingChannel(loggingChannel);

        const clientLogger = new Logger("grpc");
        clientLogger.setLoggingChannel(loggingChannel);

        const serverLogger = new Logger("gradle-server");
        serverLogger.setLoggingChannel(loggingChannel);

        if (getConfigIsDebugEnabled()) {
            Logger.setLogVerbosity(LogVerbosity.DEBUG);
        }

        const statusBarItem = vscode.window.createStatusBarItem();
        this.server = new GradleServer({ host: "localhost" }, context, serverLogger);
        this.taskServerClient = new TaskServerClient(this.server, statusBarItem, clientLogger);
        this.pinnedTasksStore = new PinnedTasksStore(context);
        this.recentTasksStore = new RecentTasksStore();
        this.taskTerminalsStore = new TaskTerminalsStore();
        this.rootProjectsStore = new RootProjectsStore();
        this.gradleBuildContentProvider = new GradleBuildContentProvider(this.taskServerClient);
        this.gradleTaskProvider = new GradleTaskProvider(
            this.rootProjectsStore,
            this.taskServerClient,
            this.gradleBuildContentProvider
        );
        this.gradleDependencyProvider = new GradleDependencyProvider(this.gradleBuildContentProvider);
        this.taskProvider = vscode.tasks.registerTaskProvider("gradle", this.gradleTaskProvider);
        this.icons = new Icons(context);

        this.gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(
            this.context,
            this.rootProjectsStore,
            this.pinnedTasksStore,
            this.gradleTaskProvider,
            this.gradleDependencyProvider,
            this.icons,
            this.taskServerClient
        );
        this.gradleTasksTreeView = vscode.window.createTreeView(GRADLE_TASKS_VIEW, {
            treeDataProvider: this.gradleTasksTreeDataProvider,
            showCollapseAll: true,
        });
        this.gradleDaemonsTreeDataProvider = new GradleDaemonsTreeDataProvider(this.context, this.rootProjectsStore);
        this.gradleDaemonsTreeView = vscode.window.createTreeView(GRADLE_DAEMONS_VIEW, {
            treeDataProvider: this.gradleDaemonsTreeDataProvider,
            showCollapseAll: false,
        });
        this.recentTasksTreeDataProvider = new RecentTasksTreeDataProvider(
            this.recentTasksStore,
            this.taskTerminalsStore,
            this.rootProjectsStore,
            this.gradleTaskProvider,
            this.taskServerClient,
            this.icons
        );
        this.recentTasksTreeView = vscode.window.createTreeView(RECENT_TASKS_VIEW, {
            treeDataProvider: this.recentTasksTreeDataProvider,
            showCollapseAll: false,
        });
        this.defaultProjectsTreeDataProvider = new DefaultProjectsTreeDataProvider(
            this.gradleTaskProvider,
            this.rootProjectsStore,
            this.taskServerClient,
            this.icons
        );
        this.defaultProjectsTreeView = vscode.window.createTreeView(GRADLE_DEFAULT_PROJECTS_VIEW, {
            treeDataProvider: this.defaultProjectsTreeDataProvider,
            showCollapseAll: false,
        });

        this.gradleTaskManager = new GradleTaskManager(context);
        this.buildFileWatcher = new FileWatcher("**/*.{gradle,gradle.kts}");
        this.gradleWrapperWatcher = new FileWatcher("**/gradle/wrapper/gradle-wrapper.properties");
        this.api = new Api(
            this.taskServerClient,
            this.gradleTasksTreeDataProvider,
            this.gradleTaskProvider,
            this.icons
        );

        this.commands = new Commands(
            this.context,
            this.pinnedTasksStore,
            this.gradleTaskProvider,
            this.gradleBuildContentProvider,
            this.gradleTasksTreeDataProvider,
            this.recentTasksTreeDataProvider,
            this.gradleDaemonsTreeDataProvider,
            this.taskServerClient,
            this.rootProjectsStore,
            this.taskTerminalsStore,
            this.recentTasksStore,
            this.gradleTasksTreeView
        );

        this.buildServerController = new BuildServerController(context);

        this.storeSubscriptions();
        this.registerCommands();
        this.handleTaskEvents();
        this.handleWatchEvents();
        this.handleEditorEvents();

        vscode.commands.registerCommand(GRADLE_DEPENDENCY_REVEAL, async (item: DependencyTreeItem) => {
            const omittedTreeItem = item.getOmittedTreeItem();
            if (omittedTreeItem) {
                await this.gradleTasksTreeView.reveal(omittedTreeItem);
            }
        });

        this.context.subscriptions.push(
            vscode.commands.registerCommand(
                GRADLE_COMPLETION,
                instrumentOperation(GRADLE_COMPLETION, async (operationId: string, ...args: string[]) => {
                    if (args.length === 2) {
                        const completionKind = args[0];
                        const completionContent = args[1];
                        sendInfo(operationId, {
                            kind: completionKind,
                            content: completionContent,
                        });
                        if (
                            completionKind === CompletionKinds.DEPENDENCY_GROUP ||
                            completionKind === CompletionKinds.DEPENDENCY_ARTIFACT
                        ) {
                            vscode.commands.executeCommand(VSCODE_TRIGGER_COMPLETION);
                        }
                    }
                })
            )
        );

        this.taskServerClient.onDidConnect(() => this.refresh());
        void startLanguageClientAndWaitForConnection(
            this.context,
            this.gradleBuildContentProvider,
            this.rootProjectsStore,
            this.server.getLanguageServerPipePath()
        );
        void this.activate();
        void vscode.commands.executeCommand("setContext", "allowParallelRun", getAllowParallelRun());
        void vscode.commands.executeCommand("setContext", Context.ACTIVATION_CONTEXT_KEY, true);
    }

    private storeSubscriptions(): void {
        this.context.subscriptions.push(
            this.taskServerClient,
            this.pinnedTasksStore,
            this.recentTasksStore,
            this.taskTerminalsStore,
            this.gradleTaskProvider,
            this.taskProvider,
            this.gradleTaskManager,
            this.buildFileWatcher,
            this.gradleWrapperWatcher,
            this.gradleDaemonsTreeView,
            this.gradleTasksTreeView,
            this.recentTasksTreeView,
            this.defaultProjectsTreeView,
            this.buildServerController
        );
    }

    public async stop() {
        await this.server.asyncDispose();
    }

    private async activate(): Promise<void> {
        const testExtension = vscode.extensions.getExtension("vscjava.vscode-java-test");
        if (testExtension) {
            testExtension.activate().then((api: any) => {
                if (api) {
                    const testRunner: GradleTestRunner = this.buildServerController.getGradleTestRunner(api);
                    api.registerTestProfile("Delegate Test to Gradle", vscode.TestRunProfileKind.Run, testRunner);
                    api.registerTestProfile(
                        "Delegate Test to Gradle (Debug)",
                        vscode.TestRunProfileKind.Debug,
                        testRunner
                    );
                }
            });
        }
        const activated = !!(await this.rootProjectsStore.getProjectRoots()).length;
        if (!this.server.isReady()) {
            await this.server.start();
        }
        await vscode.commands.executeCommand("setContext", "gradle:activated", activated);
        await vscode.commands.executeCommand("setContext", "gradle:defaultView", true);
    }

    private registerCommands(): void {
        this.commands.register();
    }

    private handleTaskTerminals(definition: GradleTaskDefinition, terminal: vscode.Terminal): void {
        // Add this task terminal to the store
        const terminalTaskName = terminal.name.replace("Task - ", "");
        if (terminalTaskName === definition.script) {
            this.taskTerminalsStore.addEntry(terminalTaskName, terminal);
        }
        terminal.show();
    }

    private handleTaskEvents(): void {
        this.gradleTaskManager.onDidStartTask(async (task: vscode.Task) => {
            const definition = task.definition as GradleTaskDefinition;

            // This madness is due to `vscode.window.onDidOpenTerminal` being handled differently
            // in different vscode versions.
            if (this.recentTerminal) {
                this.handleTaskTerminals(definition, this.recentTerminal);
                this.recentTerminal = undefined;
            } else {
                const disposable = this.onDidTerminalOpen((terminal: vscode.Terminal) => {
                    disposable.dispose();
                    this.handleTaskTerminals(definition, terminal);
                    this.recentTerminal = undefined;
                });
            }

            if (this.gradleTasksTreeView.visible && getConfigFocusTaskInExplorer() && !definition.isPinned) {
                await focusTaskInGradleTasksTree(task, this.gradleTasksTreeView);
            }
            this.recentTasksStore.addEntry(definition.id, definition.args);
            await vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
        });
        this.gradleTaskManager.onDidEndTask(async (task: vscode.Task) => {
            await vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
        });
    }

    private handleWatchEvents(): void {
        this.buildFileWatcher.onDidChange(
            instrumentOperation(GRADLE_BUILD_FILE_CHANGE, async (_operationId: string, uri: vscode.Uri) => {
                logger.info("Build file changed:", uri.fsPath);
                await this.refresh();
            })
        );
        this.buildFileWatcher.onDidOpen(
            instrumentOperation(GRADLE_BUILD_FILE_OPEN, async (_operationId: string, uri: vscode.Uri) => {
                logger.info("Build file opened:", uri.fsPath);
            })
        );
        this.gradleWrapperWatcher.onDidChange(
            instrumentOperation(GRADLE_PROPERTIES_FILE_CHANGE, async (_operationId: string, uri: vscode.Uri) => {
                logger.info("Gradle wrapper properties changed:", uri.fsPath);
                const selection = await this.showRestartWindow();
                sendInfo("", {
                    kind: "wrapperPropertiesChangedReloadRequest",
                    data2: selection === OPT_RESTART ? "true" : "false",
                });
                if (selection === OPT_RESTART) {
                    await this.restartServer();
                }
                if (isLanguageServerStarted) {
                    void vscode.commands.executeCommand("gradle.distributionChanged");
                }
            })
        );
    }

    private async restartServer(): Promise<void> {
        await this.taskServerClient.cancelBuilds();
        await commands.executeCommand("workbench.action.restartExtensionHost");
    }

    private async showRestartWindow(): Promise<string | undefined> {
        const msg = "Please restart the extension to make the change take effect. Restart now?";
        const selection = await window.showWarningMessage(msg, OPT_RESTART);
        return selection;
    }

    private refresh(): Thenable<void> {
        return vscode.commands.executeCommand(COMMAND_REFRESH);
    }

    private handleEditorEvents(): void {
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(async (event: vscode.ConfigurationChangeEvent) => {
                if (
                    event.affectsConfiguration("java.home") ||
                    event.affectsConfiguration("java.jdt.ls.java.home") ||
                    event.affectsConfiguration("java.import.gradle.java.home")
                ) {
                    const selection = await this.showRestartWindow();
                    sendInfo("", {
                        kind: "javaHomeChangedReloadRequest",
                        data2: selection === OPT_RESTART ? "true" : "false",
                    });
                    if (selection === OPT_RESTART) {
                        await this.restartServer();
                    }
                } else if (
                    event.affectsConfiguration("gradle.javaDebug.cleanOutput") ||
                    event.affectsConfiguration("gradle.nestedProjects")
                ) {
                    this.rootProjectsStore.clear();
                    await this.refresh();
                    await this.activate();
                } else if (event.affectsConfiguration("gradle.reuseTerminals")) {
                    await this.refresh();
                } else if (event.affectsConfiguration("gradle.debug")) {
                    const debug = getConfigIsDebugEnabled();
                    Logger.setLogVerbosity(debug ? LogVerbosity.DEBUG : LogVerbosity.INFO);
                } else if (
                    event.affectsConfiguration("java.import.gradle.home") ||
                    event.affectsConfiguration("java.import.gradle.version") ||
                    event.affectsConfiguration("java.import.gradle.wrapper.enabled")
                ) {
                    await this.refresh();
                } else if (event.affectsConfiguration("gradle.allowParallelRun")) {
                    void vscode.commands.executeCommand("setContext", "allowParallelRun", getAllowParallelRun());
                }
            }),
            vscode.window.onDidCloseTerminal((terminal: vscode.Terminal) => {
                this.taskTerminalsStore.removeTerminal(terminal);
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
            vscode.window.onDidOpenTerminal((terminal: vscode.Terminal) => {
                this.recentTerminal = terminal;
                this._onDidTerminalOpen.fire(terminal);
            })
        );
    }

    public getApi(): Api {
        return this.api;
    }
}
