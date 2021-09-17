import * as vscode from 'vscode';
import {
  COMMAND_SHOW_TASKS,
  ShowTasksCommand,
  COMMAND_RUN_TASK,
  RunTaskCommand,
  COMMAND_DEBUG_TASK,
  DebugTaskCommand,
  COMMAND_RESTART_TASK,
  RestartTaskCommand,
  COMMAND_RUN_TASK_WITH_ARGS,
  RunTaskWithArgsCommand,
  COMMAND_DEBUG_TASK_WITH_ARGS,
  DebugTaskWithArgsCommand,
  COMMAND_RENDER_TASK,
  RenderTaskCommand,
  COMMAND_CANCEL_BUILD,
  CancelBuildCommand,
  COMMAND_CANCEL_TREE_ITEM_TASK,
  CancelTreeItemTaskCommand,
  COMMAND_REFRESH,
  RefreshCommand,
  COMMAND_LOAD_TASKS,
  LoadTasksCommand,
  COMMAND_REFRESH_DAEMON_STATUS,
  RefreshDaemonStatusCommand,
  COMMAND_STOP_DAEMONS,
  StopDaemonsCommand,
  COMMAND_STOP_DAEMON,
  StopDaemonCommand,
  COMMAND_EXPLORER_TREE,
  ExplorerTreeCommand,
  COMMAND_EXPLORER_FLAT,
  ExplorerFlatCommand,
  COMMAND_OPEN_SETTINGS,
  OpenSettingsCommand,
  COMMAND_OPEN_BUILD_FILE,
  OpenBuildFileCommand,
  COMMAND_OPEN_BUILD_FILE_DOUBLE_CLICK,
  OpenBuildFileDoubleClickCommand,
  COMMAND_CANCELLING_TREE_ITEM_TASK,
  CancellingTreeItemTaskCommand,
  COMMAND_SHOW_LOGS,
  ShowLogsCommand,
  COMMAND_PIN_TASK,
  PinTaskCommand,
  COMMAND_PIN_TASK_WITH_ARGS,
  PinTaskWithArgsCommand,
  COMMAND_REMOVE_PINNED_TASK,
  RemovePinnedTaskCommand,
  COMMAND_OPEN_PIN_HELP,
  OpenPinHelpCommand,
  COMMAND_SHOW_TASK_TERMINAL,
  ShowTaskTerminalCommand,
  COMMAND_CLOSE_TASK_TERMINALS,
  CloseTaskTerminalsCommand,
  COMMAND_CLOSE_ALL_TASK_TERMINALS,
  CloseAllTaskTerminalsCommand,
  COMMAND_CLEAR_ALL_RECENT_TASKS,
  ClearAllRecentTasksCommand,
  COMMAND_CLEAR_ALL_PINNED_TASKS,
  ClearAllPinnedTasksCommand,
  COMMAND_REMOVE_RECENT_TASK,
  RemoveRecentTaskCommand,
  COMMAND_RUN_BUILD,
  RunBuildCommand,
  COMMAND_FIND_TASK,
  FindTaskCommand,
} from '.';
import { GradleClient } from '../client';
import {
  PinnedTasksStore,
  RecentTasksStore,
  RootProjectsStore,
  TaskTerminalsStore,
} from '../stores';
import { GradleTaskProvider } from '../tasks';
import {
  GradleDaemonsTreeDataProvider,
  GradleTasksTreeDataProvider,
  PinnedTasksTreeDataProvider,
  RecentTasksTreeDataProvider,
} from '../views';
import { Command } from './Command';

export class Commands {
  constructor(
    private context: vscode.ExtensionContext,
    private pinnedTasksStore: PinnedTasksStore,
    private gradleTaskProvider: GradleTaskProvider,
    private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
    private pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider,
    private recentTasksTreeDataProvider: RecentTasksTreeDataProvider,
    private gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider,
    private client: GradleClient,
    private rootProjectsStore: RootProjectsStore,
    private taskTerminalsStore: TaskTerminalsStore,
    private recentTasksStore: RecentTasksStore,
    private gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>
  ) {}

  private registerCommand(commandId: string, command: Command): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(commandId, (...args: unknown[]) => {
        return command.run(...args);
      })
    );
  }

  register(): void {
    this.registerCommand(
      COMMAND_SHOW_TASKS,
      new ShowTasksCommand(this.gradleTasksTreeView)
    );
    this.registerCommand(
      COMMAND_RUN_TASK,
      new RunTaskCommand(
        this.rootProjectsStore,
        this.taskTerminalsStore,
        this.client
      )
    );
    this.registerCommand(
      COMMAND_DEBUG_TASK,
      new DebugTaskCommand(
        this.rootProjectsStore,
        this.taskTerminalsStore,
        this.client
      )
    );
    this.registerCommand(
      COMMAND_RESTART_TASK,
      new RestartTaskCommand(this.client)
    );
    this.registerCommand(
      COMMAND_RUN_TASK_WITH_ARGS,
      new RunTaskWithArgsCommand(
        this.rootProjectsStore,
        this.taskTerminalsStore,
        this.client
      )
    );
    this.registerCommand(
      COMMAND_DEBUG_TASK_WITH_ARGS,
      new DebugTaskWithArgsCommand(
        this.rootProjectsStore,
        this.taskTerminalsStore,
        this.client
      )
    );
    this.registerCommand(
      COMMAND_RENDER_TASK,
      new RenderTaskCommand(
        this.gradleTasksTreeDataProvider,
        this.pinnedTasksTreeDataProvider,
        this.recentTasksTreeDataProvider
      )
    );
    this.registerCommand(
      COMMAND_CANCEL_BUILD,
      new CancelBuildCommand(this.client)
    );
    this.registerCommand(
      COMMAND_CANCEL_TREE_ITEM_TASK,
      new CancelTreeItemTaskCommand()
    );
    this.registerCommand(
      COMMAND_REFRESH,
      new RefreshCommand(
        this.gradleTaskProvider,
        this.gradleTasksTreeDataProvider,
        this.pinnedTasksTreeDataProvider,
        this.recentTasksTreeDataProvider
      )
    );
    this.registerCommand(
      COMMAND_LOAD_TASKS,
      new LoadTasksCommand(this.gradleTaskProvider)
    );
    this.registerCommand(
      COMMAND_REFRESH_DAEMON_STATUS,
      new RefreshDaemonStatusCommand(this.gradleDaemonsTreeDataProvider)
    );
    this.registerCommand(
      COMMAND_STOP_DAEMONS,
      new StopDaemonsCommand(this.client, this.rootProjectsStore)
    );
    this.registerCommand(
      COMMAND_STOP_DAEMON,
      new StopDaemonCommand(this.client)
    );
    this.registerCommand(
      COMMAND_EXPLORER_TREE,
      new ExplorerTreeCommand(this.gradleTasksTreeDataProvider)
    );
    this.registerCommand(
      COMMAND_EXPLORER_FLAT,
      new ExplorerFlatCommand(this.gradleTasksTreeDataProvider)
    );
    this.registerCommand(
      COMMAND_OPEN_SETTINGS,
      new OpenSettingsCommand(this.context)
    );
    this.registerCommand(COMMAND_OPEN_BUILD_FILE, new OpenBuildFileCommand());

    this.registerCommand(
      COMMAND_OPEN_BUILD_FILE_DOUBLE_CLICK,
      new OpenBuildFileDoubleClickCommand()
    );
    this.registerCommand(
      COMMAND_CANCELLING_TREE_ITEM_TASK,
      new CancellingTreeItemTaskCommand()
    );
    this.registerCommand(COMMAND_SHOW_LOGS, new ShowLogsCommand());
    this.registerCommand(
      COMMAND_PIN_TASK,
      new PinTaskCommand(this.pinnedTasksTreeDataProvider)
    );
    this.registerCommand(
      COMMAND_PIN_TASK_WITH_ARGS,
      new PinTaskWithArgsCommand(this.pinnedTasksTreeDataProvider)
    );
    this.registerCommand(
      COMMAND_REMOVE_PINNED_TASK,
      new RemovePinnedTaskCommand(this.pinnedTasksTreeDataProvider)
    );
    this.registerCommand(COMMAND_OPEN_PIN_HELP, new OpenPinHelpCommand());
    this.registerCommand(
      COMMAND_SHOW_TASK_TERMINAL,
      new ShowTaskTerminalCommand(this.taskTerminalsStore)
    );
    this.registerCommand(
      COMMAND_CLOSE_TASK_TERMINALS,
      new CloseTaskTerminalsCommand(this.taskTerminalsStore)
    );
    this.registerCommand(
      COMMAND_CLOSE_ALL_TASK_TERMINALS,
      new CloseAllTaskTerminalsCommand(this.taskTerminalsStore)
    );
    this.registerCommand(
      COMMAND_CLEAR_ALL_RECENT_TASKS,
      new ClearAllRecentTasksCommand(this.recentTasksStore)
    );
    this.registerCommand(
      COMMAND_CLEAR_ALL_PINNED_TASKS,
      new ClearAllPinnedTasksCommand(this.pinnedTasksStore)
    );
    this.registerCommand(
      COMMAND_REMOVE_RECENT_TASK,
      new RemoveRecentTaskCommand(this.recentTasksStore)
    );
    this.registerCommand(
      COMMAND_RUN_BUILD,
      new RunBuildCommand(this.rootProjectsStore, this.client)
    );
    this.registerCommand(
      COMMAND_FIND_TASK,
      new FindTaskCommand(this.gradleTasksTreeView, this.gradleTaskProvider)
    );
  }
}
