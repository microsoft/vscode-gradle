import * as vscode from 'vscode';
import { logger, LogVerbosity, Logger } from './logger';
import { Api } from './api';
import { GradleClient } from './client';
import { GradleServer } from './server';
import { Icons } from './icons';
import {
  GradleDaemonsTreeDataProvider,
  PinnedTasksTreeDataProvider,
  RecentTasksTreeDataProvider,
  GradleTasksTreeDataProvider,
} from './views';
import {
  PinnedTasksStore,
  RecentTasksStore,
  TaskTerminalsStore,
  RootProjectsStore,
} from './stores';
import {
  GradleTaskProvider,
  GradleTaskManager,
  GradleTaskDefinition,
} from './tasks';
import {
  GRADLE_TASKS_VIEW,
  PINNED_TASKS_VIEW,
  GRADLE_DAEMONS_VIEW,
  RECENT_TASKS_VIEW,
} from './views/constants';
import { focusTaskInGradleTasksTree } from './views/viewUtil';
import { COMMAND_RENDER_TASK, COMMAND_REFRESH } from './commands';
import { Commands } from './commands/Commands';
import {
  getConfigIsDebugEnabled,
  getConfigFocusTaskInExplorer,
  getConfigReuseTerminals,
} from './util/config';
import { FileWatcher } from './util/FileWatcher';

export class Extension {
  private readonly client: GradleClient;
  private readonly server: GradleServer;
  private readonly pinnedTasksStore: PinnedTasksStore;
  private readonly recentTasksStore: RecentTasksStore;
  private readonly taskTerminalsStore: TaskTerminalsStore;
  private readonly rootProjectsStore: RootProjectsStore;
  private readonly gradleTaskProvider: GradleTaskProvider;
  private readonly taskProvider: vscode.Disposable;
  private readonly gradleTaskManager: GradleTaskManager;
  private readonly icons: Icons;
  private readonly buildFileWatcher: FileWatcher;
  private readonly gradleWrapperWatcher: FileWatcher;
  private readonly gradleDaemonsTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
  private readonly pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider;
  private readonly pinnedTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly recentTasksTreeDataProvider: RecentTasksTreeDataProvider;
  private readonly recentTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;
  private readonly api: Api;
  private readonly commands: Commands;
  private recentTerminal?: vscode.Terminal;

  public constructor(private readonly context: vscode.ExtensionContext) {
    const loggingChannel = vscode.window.createOutputChannel('Gradle Tasks');
    logger.setLoggingChannel(loggingChannel);

    const clientLogger = new Logger('grpc');
    clientLogger.setLoggingChannel(loggingChannel);

    const serverLogger = new Logger('gradle-server');
    serverLogger.setLoggingChannel(loggingChannel);

    if (getConfigIsDebugEnabled()) {
      Logger.setLogVerbosity(LogVerbosity.DEBUG);
    }

    const statusBarItem = vscode.window.createStatusBarItem();
    this.server = new GradleServer(
      { host: 'localhost' },
      context,
      serverLogger
    );
    this.client = new GradleClient(this.server, statusBarItem, clientLogger);
    this.pinnedTasksStore = new PinnedTasksStore(context);
    this.recentTasksStore = new RecentTasksStore();
    this.taskTerminalsStore = new TaskTerminalsStore();
    this.rootProjectsStore = new RootProjectsStore();
    this.gradleTaskProvider = new GradleTaskProvider(
      this.rootProjectsStore,
      this.client
    );
    this.taskProvider = vscode.tasks.registerTaskProvider(
      'gradle',
      this.gradleTaskProvider
    );
    this.icons = new Icons(context);

    this.gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(
      this.context,
      this.rootProjectsStore,
      this.gradleTaskProvider,
      this.icons
    );
    this.gradleTasksTreeView = vscode.window.createTreeView(GRADLE_TASKS_VIEW, {
      treeDataProvider: this.gradleTasksTreeDataProvider,
      showCollapseAll: true,
    });
    this.gradleDaemonsTreeDataProvider = new GradleDaemonsTreeDataProvider(
      this.context,
      this.rootProjectsStore,
      this.client
    );
    this.gradleDaemonsTreeView = vscode.window.createTreeView(
      GRADLE_DAEMONS_VIEW,
      {
        treeDataProvider: this.gradleDaemonsTreeDataProvider,
        showCollapseAll: false,
      }
    );
    this.pinnedTasksTreeDataProvider = new PinnedTasksTreeDataProvider(
      this.context,
      this.pinnedTasksStore,
      this.rootProjectsStore,
      this.gradleTaskProvider,
      this.icons,
      this.client
    );
    this.pinnedTasksTreeView = vscode.window.createTreeView(PINNED_TASKS_VIEW, {
      treeDataProvider: this.pinnedTasksTreeDataProvider,
      showCollapseAll: false,
    });

    this.recentTasksTreeDataProvider = new RecentTasksTreeDataProvider(
      this.context,
      this.recentTasksStore,
      this.taskTerminalsStore,
      this.rootProjectsStore,
      this.gradleTaskProvider,
      this.client,
      this.icons
    );
    this.recentTasksTreeView = vscode.window.createTreeView(RECENT_TASKS_VIEW, {
      treeDataProvider: this.recentTasksTreeDataProvider,
      showCollapseAll: false,
    });

    this.gradleTaskManager = new GradleTaskManager(context);
    this.buildFileWatcher = new FileWatcher('**/*.{gradle,gradle.kts}');
    this.gradleWrapperWatcher = new FileWatcher(
      '**/gradle/wrapper/gradle-wrapper.properties'
    );
    this.api = new Api(
      this.client,
      this.gradleTasksTreeDataProvider,
      this.gradleTaskProvider,
      this.icons
    );

    this.commands = new Commands(
      this.context,
      this.pinnedTasksStore,
      this.gradleTaskProvider,
      this.gradleTasksTreeDataProvider,
      this.pinnedTasksTreeDataProvider,
      this.recentTasksTreeDataProvider,
      this.gradleDaemonsTreeDataProvider,
      this.client,
      this.rootProjectsStore,
      this.taskTerminalsStore,
      this.recentTasksStore,
      this.gradleTasksTreeView
    );

    this.storeSubscriptions();
    this.registerCommands();
    this.handleTaskEvents();
    this.handleWatchEvents();
    this.handleEditorEvents();

    this.client.onDidConnect(() => this.refresh());

    void this.activate();
  }

  private storeSubscriptions(): void {
    this.context.subscriptions.push(
      this.client,
      this.server,
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
      this.pinnedTasksTreeView,
      this.recentTasksTreeView
    );
  }

  private async activate(): Promise<void> {
    const activated = !!(await this.rootProjectsStore.getProjectRoots()).length;
    if (activated && !this.server.isReady()) {
      await this.server.start();
    }
    await vscode.commands.executeCommand(
      'setContext',
      'gradle:activated',
      activated
    );
  }

  private registerCommands(): void {
    this.commands.register();
  }

  private handleTaskEvents(): void {
    this.gradleTaskManager.onDidStartTask(async (task: vscode.Task) => {
      const reuseTerminals = getConfigReuseTerminals();

      const definition = task.definition as GradleTaskDefinition;

      // Close previously opened task terminals
      this.taskTerminalsStore.disposeTaskTerminals(
        task.definition as GradleTaskDefinition,
        reuseTerminals
      );
      // Add this task terminal to the store
      if (this.recentTerminal) {
        const terminalTaskName = this.recentTerminal.name.replace(
          'Task - ',
          ''
        );
        if (terminalTaskName === definition.script) {
          this.taskTerminalsStore.addEntry(
            terminalTaskName,
            this.recentTerminal
          );
        }
      }

      if (this.gradleTasksTreeView.visible && getConfigFocusTaskInExplorer()) {
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
    this.buildFileWatcher.onDidChange(async (uri: vscode.Uri) => {
      logger.info('Build file changed:', uri.fsPath);
      await this.refresh();
    });
    this.gradleWrapperWatcher.onDidChange(async (uri: vscode.Uri) => {
      logger.info('Gradle wrapper properties changed:', uri.fsPath);
      await this.restartServer();
    });
  }

  private async restartServer(): Promise<void> {
    if (this.server.isReady()) {
      await this.client.cancelBuilds();
      await this.server.restart();
    }
  }

  private refresh(): Thenable<void> {
    return vscode.commands.executeCommand(COMMAND_REFRESH);
  }

  private handleEditorEvents(): void {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(
        async (event: vscode.ConfigurationChangeEvent) => {
          if (
            event.affectsConfiguration('java.home') ||
            event.affectsConfiguration('java.import.gradle.java.home')
          ) {
            await this.restartServer();
          } else if (
            event.affectsConfiguration('gradle.javaDebug') ||
            event.affectsConfiguration('gradle.nestedProjects')
          ) {
            this.rootProjectsStore.clear();
            await this.refresh();
            await this.activate();
          } else if (event.affectsConfiguration('gradle.reuseTerminals')) {
            await this.refresh();
          } else if (event.affectsConfiguration('gradle.debug')) {
            const debug = getConfigIsDebugEnabled();
            Logger.setLogVerbosity(
              debug ? LogVerbosity.DEBUG : LogVerbosity.INFO
            );
          }
        }
      ),
      vscode.window.onDidCloseTerminal((terminal: vscode.Terminal) => {
        this.taskTerminalsStore.removeTerminal(terminal);
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      vscode.window.onDidOpenTerminal((terminal: vscode.Terminal) => {
        this.recentTerminal = terminal;
      })
    );
  }

  public getApi(): Api {
    return this.api;
  }
}
