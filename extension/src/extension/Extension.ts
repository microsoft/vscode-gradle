import * as vscode from 'vscode';
import { logger } from '../logger';
import { registerCommands } from '../commands';
import { Api } from '../api/Api';
import { GradleClient } from '../client/GradleClient';
import { GradleTasksTreeDataProvider } from '../views/gradleTasks/GradleTasksTreeDataProvider';
import { GradleServer } from '../server/GradleServer';
import { BookmarkedTasksStore } from '../stores/BookmarkedTasksStore';
import { RecentTasksStore } from '../stores/RecentTasksStore';
import { GradleTaskProvider } from '../tasks/GradleTaskProvider';
import { Icons } from '../icons/Icons';
import { GradleDaemonsTreeDataProvider } from '../views/gradleDaemons/GradleDaemonsTreeDataProvider';
import { BookmarkedTasksTreeDataProvider } from '../views/bookmarkedTasks/BookmarkedTasksTreeDataProvider';
import { GradleTaskManager } from '../tasks/GradleTaskManager';
import { GradleTaskDefinition } from '../tasks/GradleTaskDefinition';
import { BuildFileWatcher } from '../buildFileWatcher/BuildFileWatcher';
import { getConfigFocusTaskInExplorer } from '../config';
import { focusTaskInGradleTasksTree } from '../views/viewUtil';
import { TaskTerminalsStore } from '../stores/TaskTerminalsStore';
import { RecentTasksTreeDataProvider } from '../views/recentTasks/RecentTasksTreeDataProvider';
import {
  GRADLE_TASKS_VIEW,
  BOOKMARKED_TASKS_VIEW,
  GRADLE_DAEMONS_VIEW,
  RECENT_TASKS_VIEW,
} from '../views/constants';
import {
  COMMAND_LOAD_TASKS,
  COMMAND_REFRESH,
  COMMAND_RENDER_TASK,
} from '../commands/constants';

export class Extension {
  private static instance: Extension;
  public static getInstance(): Extension {
    return Extension.instance;
  }

  private readonly client: GradleClient;
  private readonly server: GradleServer;
  private readonly bookmarkedTasksStore: BookmarkedTasksStore;
  private readonly recentTasksStore: RecentTasksStore;
  private readonly taskTerminalsStore: TaskTerminalsStore;
  private readonly gradleTaskProvider: GradleTaskProvider;
  private readonly gradleTaskManager: GradleTaskManager;
  private readonly icons: Icons;
  private readonly buildFileWatcher: BuildFileWatcher;
  private readonly gradleDaemonsTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
  private readonly bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider;
  private readonly bookmarkedTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly recentTasksTreeDataProvider: RecentTasksTreeDataProvider;
  private readonly recentTasksTreeView: vscode.TreeView<vscode.TreeItem>;
  private readonly gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;

  public constructor(private readonly context: vscode.ExtensionContext) {
    logger.setLoggingChannel(vscode.window.createOutputChannel('Gradle Tasks'));
    const statusBarItem = vscode.window.createStatusBarItem();

    this.server = new GradleServer({ host: 'localhost' }, context);
    this.client = new GradleClient(this.server, statusBarItem);
    this.bookmarkedTasksStore = new BookmarkedTasksStore(context);
    this.recentTasksStore = new RecentTasksStore();
    this.taskTerminalsStore = new TaskTerminalsStore();
    this.gradleTaskProvider = new GradleTaskProvider(/*, taskTerminalsStore*/);
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
    this.bookmarkedTasksTreeDataProvider = new BookmarkedTasksTreeDataProvider(
      this.context,
      this.bookmarkedTasksStore
    );
    this.bookmarkedTasksTreeView = vscode.window.createTreeView(
      BOOKMARKED_TASKS_VIEW,
      {
        treeDataProvider: this.bookmarkedTasksTreeDataProvider,
        showCollapseAll: false,
      }
    );

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
    this.buildFileWatcher = new BuildFileWatcher();

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
      this.bookmarkedTasksStore,
      this.recentTasksStore,
      this.taskTerminalsStore,
      this.gradleTaskProvider,
      this.gradleTaskManager,
      this.buildFileWatcher,
      this.gradleDaemonsTreeView,
      this.gradleTasksTreeView,
      this.bookmarkedTasksTreeView,
      this.recentTasksTreeView
    );
  }

  private registerCommands(): void {
    registerCommands(
      this.context,
      this.gradleTasksTreeDataProvider,
      this.gradleDaemonsTreeDataProvider,
      this.bookmarkedTasksTreeDataProvider,
      this.recentTasksTreeDataProvider,
      this.gradleTasksTreeView
    );
  }

  private loadTasks(): void {
    this.client.onDidConnect(() => {
      vscode.commands.executeCommand(COMMAND_LOAD_TASKS);
    });
  }

  private handleTaskEvents(): void {
    this.gradleTaskManager.onDidStartTask(async (task: vscode.Task) => {
      if (this.gradleTasksTreeView.visible && getConfigFocusTaskInExplorer()) {
        await focusTaskInGradleTasksTree(this.gradleTasksTreeView, task);
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
    this.buildFileWatcher.addHandler(() => {
      vscode.commands.executeCommand(COMMAND_REFRESH);
    });
    this.gradleTaskProvider.onDidRefreshStart(() =>
      this.buildFileWatcher.stop()
    );
    this.gradleTaskProvider.onDidRefreshStop(() =>
      this.buildFileWatcher.start()
    );
    this.gradleTaskManager.onDidEndAllTasks(() =>
      this.buildFileWatcher.start()
    );
    this.gradleTaskManager.onDidStartTask(() => this.buildFileWatcher.stop());
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
        this.taskTerminalsStore.fireOnDidChange(null);
      })
    );
  }

  public getApi(): Api {
    return new Api(this.client, this.gradleTasksTreeDataProvider!);
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

  public getIcons(): Icons {
    return this.icons;
  }
}
