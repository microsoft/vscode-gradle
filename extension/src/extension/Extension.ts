import * as vscode from 'vscode';
import { logger } from '../logger';
import { registerCommands } from '../commands/register';
import { Api } from '../api';
import { GradleClient } from '../client';
import { GradleServer } from '../server';
import { Icons } from '../icons';
import { getConfigFocusTaskInExplorer } from '../config';
import {
  GradleDaemonsTreeDataProvider,
  PinnedTasksTreeDataProvider,
  RecentTasksTreeDataProvider,
  GradleTasksTreeDataProvider,
} from '../views';
import {
  PinnedTasksStore,
  RecentTasksStore,
  TaskTerminalsStore,
} from '../stores';
import {
  GradleTaskProvider,
  GradleTaskManager,
  GradleTaskDefinition,
} from '../tasks';
import {
  GRADLE_TASKS_VIEW,
  PINNED_TASKS_VIEW,
  GRADLE_DAEMONS_VIEW,
  RECENT_TASKS_VIEW,
} from '../views/constants';
import { focusTaskInGradleTasksTree } from '../views/viewUtil';
import { GracefulFileWatcher } from '../watcher';
import {
  COMMAND_LOAD_TASKS,
  COMMAND_RENDER_TASK,
  COMMAND_REFRESH,
} from '../commands';

export class Extension {
  private static instance: Extension;
  public static getInstance(): Extension {
    return Extension.instance;
  }

  private readonly client: GradleClient;
  private readonly server: GradleServer;
  private readonly pinnedTasksStore: PinnedTasksStore;
  private readonly recentTasksStore: RecentTasksStore;
  private readonly taskTerminalsStore: TaskTerminalsStore;
  private readonly gradleTaskProvider: GradleTaskProvider;
  private readonly taskProvider: vscode.Disposable;
  private readonly gradleTaskManager: GradleTaskManager;
  private readonly icons: Icons;
  private readonly buildFileWatcher: GracefulFileWatcher;
  private readonly gradleWrapperWatcher: GracefulFileWatcher;
  private readonly gradleDaemonsTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
  private readonly pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider;
  private readonly pinnedTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly recentTasksTreeDataProvider: RecentTasksTreeDataProvider;
  private readonly recentTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;
  private readonly api: Api;

  public constructor(private readonly context: vscode.ExtensionContext) {
    logger.setLoggingChannel(vscode.window.createOutputChannel('Gradle Tasks'));
    const statusBarItem = vscode.window.createStatusBarItem();

    this.server = new GradleServer({ host: 'localhost' }, context);
    this.client = new GradleClient(this.server, statusBarItem);
    this.pinnedTasksStore = new PinnedTasksStore(context);
    this.recentTasksStore = new RecentTasksStore();
    this.taskTerminalsStore = new TaskTerminalsStore();
    this.gradleTaskProvider = new GradleTaskProvider();
    this.taskProvider = vscode.tasks.registerTaskProvider(
      'gradle',
      this.gradleTaskProvider
    );
    this.icons = new Icons(context);

    this.gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(
      this.context
    );
    this.gradleTasksTreeView = vscode.window.createTreeView(GRADLE_TASKS_VIEW, {
      treeDataProvider: this.gradleTasksTreeDataProvider,
      showCollapseAll: true,
    });
    this.gradleDaemonsTreeDataProvider = new GradleDaemonsTreeDataProvider(
      this.context
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
      this.pinnedTasksStore
    );
    this.pinnedTasksTreeView = vscode.window.createTreeView(PINNED_TASKS_VIEW, {
      treeDataProvider: this.pinnedTasksTreeDataProvider,
      showCollapseAll: false,
    });

    this.recentTasksTreeDataProvider = new RecentTasksTreeDataProvider(
      this.context,
      this.recentTasksStore,
      this.taskTerminalsStore
    );
    this.recentTasksTreeView = vscode.window.createTreeView(RECENT_TASKS_VIEW, {
      treeDataProvider: this.recentTasksTreeDataProvider,
      showCollapseAll: false,
    });

    this.gradleTaskManager = new GradleTaskManager(context);
    this.buildFileWatcher = new GracefulFileWatcher(
      '**/*.{gradle,gradle.kts}',
      this.gradleTaskProvider,
      this.gradleTaskManager
    );
    this.gradleWrapperWatcher = new GracefulFileWatcher(
      '**/gradle/wrapper/gradle-wrapper.properties',
      this.gradleTaskProvider,
      this.gradleTaskManager
    );
    this.api = new Api(this.client, this.gradleTasksTreeDataProvider);

    this.storeSubscriptions();
    this.registerCommands();
    this.handleTaskEvents();
    this.handleWatchEvents();
    this.handleEditorEvents();
    this.loadTasks();

    Extension.instance = this;
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

  private registerCommands(): void {
    registerCommands(this.context);
  }

  private loadTasks(): void {
    this.client.onDidConnect(() => {
      this.getGradleTaskProvider().clearTasksCache();
      // Explicitly load tasks as the views not be visible
      this.getGradleTaskProvider().loadTasks();
      // If the views are visible, refresh them
      this.getGradleTasksTreeDataProvider().refresh();
      this.getPinnedTasksTreeDataProvider().refresh();
      this.getRecentTasksTreeDataProvider().refresh();
    });
  }

  private handleTaskEvents(): void {
    this.gradleTaskManager.onDidStartTask(async (task: vscode.Task) => {
      if (this.gradleTasksTreeView.visible && getConfigFocusTaskInExplorer()) {
        await focusTaskInGradleTasksTree(task);
      }
      const definition = task.definition as GradleTaskDefinition;
      this.recentTasksStore.addEntry(definition.id, definition.args);
      await vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
    });
    this.gradleTaskManager.onDidEndTask(async (task: vscode.Task) => {
      await vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
    });
  }

  private handleWatchEvents(): void {
    this.buildFileWatcher.onDidChange((uri: vscode.Uri) => {
      logger.debug('Build file changed:', uri.fsPath);
      vscode.commands.executeCommand(COMMAND_REFRESH);
    });
    this.gradleWrapperWatcher.onDidChange((uri: vscode.Uri) => {
      logger.debug('Gradle wrapper properties changed:', uri.fsPath);
      this.client.close();
      const disposable = this.client.onDidConnect(() => {
        disposable.dispose();
        vscode.commands.executeCommand(COMMAND_REFRESH);
      });
      this.server.restart();
    });
  }

  private handleEditorEvents(): void {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(
        (event: vscode.ConfigurationChangeEvent) => {
          if (
            event.affectsConfiguration('java.home') &&
            this.server.isReady()
          ) {
            this.server.restart();
          }
          if (event.affectsConfiguration('gradle.javaDebug')) {
            vscode.commands.executeCommand(COMMAND_REFRESH);
          }
        }
      ),
      vscode.window.onDidCloseTerminal((terminal: vscode.Terminal) => {
        this.taskTerminalsStore.removeTerminal(terminal);
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        vscode.commands.executeCommand(COMMAND_REFRESH);
      })
    );
  }

  public getApi(): Api {
    return this.api;
  }

  public getGradleTaskProvider(): GradleTaskProvider {
    return this.gradleTaskProvider;
  }

  public getClient(): GradleClient {
    return this.client;
  }

  public getTaskTerminalsStore(): TaskTerminalsStore {
    return this.taskTerminalsStore;
  }

  public getRecentTasksStore(): RecentTasksStore {
    return this.recentTasksStore;
  }

  public getPinnedTasksStore(): PinnedTasksStore {
    return this.pinnedTasksStore;
  }

  public getGradleTasksTreeDataProvider(): GradleTasksTreeDataProvider {
    return this.gradleTasksTreeDataProvider;
  }

  public getPinnedTasksTreeDataProvider(): PinnedTasksTreeDataProvider {
    return this.pinnedTasksTreeDataProvider;
  }

  public getRecentTasksTreeDataProvider(): RecentTasksTreeDataProvider {
    return this.recentTasksTreeDataProvider;
  }

  public getGradleTasksTreeView(): vscode.TreeView<vscode.TreeItem> {
    return this.gradleTasksTreeView;
  }

  public getGradleDaemonsTreeDataProvider(): GradleDaemonsTreeDataProvider {
    return this.gradleDaemonsTreeDataProvider;
  }

  public getIcons(): Icons {
    return this.icons;
  }
}
