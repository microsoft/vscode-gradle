import * as vscode from 'vscode';
import {
  COMMAND_SHOW_TASKS,
  showTasksCommand,
  COMMAND_RUN_TASK,
  runTaskCommand,
  COMMAND_DEBUG_TASK,
  debugTaskCommand,
  COMMAND_RESTART_TASK,
  restartTaskCommand,
  COMMAND_RUN_TASK_WITH_ARGS,
  runTaskWithArgsCommand,
  COMMAND_DEBUG_TASK_WITH_ARGS,
  debugTaskWithArgsCommand,
  COMMAND_RENDER_TASK,
  renderTaskCommand,
  COMMAND_CANCEL_TASK,
  cancelTaskCommand,
  COMMAND_CANCEL_TREE_ITEM_TASK,
  cancelTreeItemTaskCommand,
  COMMAND_REFRESH,
  refreshCommand,
  COMMAND_LOAD_TASKS,
  loadTasksCommand,
  COMMAND_REFRESH_DAEMON_STATUS,
  refreshDaemonStatusCommand,
  COMMAND_STOP_DAEMONS,
  stopDaemonsCommand,
  COMMAND_STOP_DAEMON,
  stopDaemonCommand,
  COMMAND_EXPLORER_TREE,
  explorerTreeCommand,
  COMMAND_EXPLORER_FLAT,
  explorerFlatCommand,
  COMMAND_OPEN_SETTINGS,
  openSettingsCommand,
  COMMAND_OPEN_BUILD_FILE,
  openBuildFileCommand,
  COMMAND_CANCELLING_TREE_ITEM_TASK,
  cancellingTreeItemTaskCommand,
  COMMAND_SHOW_LOGS,
  showLogsCommand,
  COMMAND_PIN_TASK,
  pinTaskCommand,
  COMMAND_PIN_TASK_WITH_ARGS,
  pinTaskWithArgsCommand,
  COMMAND_REMOVE_PINNED_TASK,
  removePinnedTaskCommand,
  COMMAND_OPEN_PIN_HELP,
  openPinHelpCommand,
  COMMAND_SHOW_TASK_TERMINAL,
  showTaskTerminalCommand,
  COMMAND_CLOSE_TASK_TERMINALS,
  closeTaskTerminalsCommand,
  COMMAND_CLOSE_ALL_TASK_TERMINALS,
  closeAllTaskTerminalsCommand,
  COMMAND_CLEAR_ALL_RECENT_TASKS,
  clearAllRecentTasksCommand,
  COMMAND_CLEAR_ALL_PINNED_TASKS,
  clearAllPinnedTasksCommand,
  COMMAND_REMOVE_RECENT_TASK,
  removeRecentTaskCommand,
} from '.';

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SHOW_TASKS, showTasksCommand),
    vscode.commands.registerCommand(COMMAND_RUN_TASK, runTaskCommand),
    vscode.commands.registerCommand(COMMAND_DEBUG_TASK, debugTaskCommand),
    vscode.commands.registerCommand(COMMAND_RESTART_TASK, restartTaskCommand),
    vscode.commands.registerCommand(
      COMMAND_RUN_TASK_WITH_ARGS,
      runTaskWithArgsCommand
    ),
    vscode.commands.registerCommand(
      COMMAND_DEBUG_TASK_WITH_ARGS,
      debugTaskWithArgsCommand
    ),
    vscode.commands.registerCommand(COMMAND_RENDER_TASK, renderTaskCommand),
    vscode.commands.registerCommand(COMMAND_CANCEL_TASK, cancelTaskCommand),
    vscode.commands.registerCommand(
      COMMAND_CANCEL_TREE_ITEM_TASK,
      cancelTreeItemTaskCommand
    ),
    vscode.commands.registerCommand(COMMAND_REFRESH, refreshCommand),
    vscode.commands.registerCommand(COMMAND_LOAD_TASKS, loadTasksCommand),
    vscode.commands.registerCommand(
      COMMAND_REFRESH_DAEMON_STATUS,
      refreshDaemonStatusCommand
    ),
    vscode.commands.registerCommand(COMMAND_STOP_DAEMONS, stopDaemonsCommand),
    vscode.commands.registerCommand(COMMAND_STOP_DAEMON, stopDaemonCommand),
    vscode.commands.registerCommand(COMMAND_EXPLORER_TREE, explorerTreeCommand),
    vscode.commands.registerCommand(COMMAND_EXPLORER_FLAT, explorerFlatCommand),
    vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, openSettingsCommand),
    vscode.commands.registerCommand(
      COMMAND_OPEN_BUILD_FILE,
      openBuildFileCommand
    ),
    vscode.commands.registerCommand(
      COMMAND_CANCELLING_TREE_ITEM_TASK,
      cancellingTreeItemTaskCommand
    ),
    vscode.commands.registerCommand(COMMAND_SHOW_LOGS, showLogsCommand),
    vscode.commands.registerCommand(COMMAND_PIN_TASK, pinTaskCommand),
    vscode.commands.registerCommand(
      COMMAND_PIN_TASK_WITH_ARGS,
      pinTaskWithArgsCommand
    ),
    vscode.commands.registerCommand(
      COMMAND_REMOVE_PINNED_TASK,
      removePinnedTaskCommand
    ),
    vscode.commands.registerCommand(COMMAND_OPEN_PIN_HELP, openPinHelpCommand),
    vscode.commands.registerCommand(
      COMMAND_SHOW_TASK_TERMINAL,
      showTaskTerminalCommand
    ),
    vscode.commands.registerCommand(
      COMMAND_CLOSE_TASK_TERMINALS,
      closeTaskTerminalsCommand
    ),
    vscode.commands.registerCommand(
      COMMAND_CLOSE_ALL_TASK_TERMINALS,
      closeAllTaskTerminalsCommand
    ),
    vscode.commands.registerCommand(
      COMMAND_CLEAR_ALL_RECENT_TASKS,
      clearAllRecentTasksCommand
    ),
    vscode.commands.registerCommand(
      COMMAND_CLEAR_ALL_PINNED_TASKS,
      clearAllPinnedTasksCommand
    ),
    vscode.commands.registerCommand(
      COMMAND_REMOVE_RECENT_TASK,
      removeRecentTaskCommand
    )
  );
}
