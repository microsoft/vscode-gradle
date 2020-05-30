import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { getIgnoreDaemonStopWarning } from '../config';
import { logger } from '../logger';
import {
  isJavaLanguageSupportExtensionActivated,
  JAVA_CONFIGURATION_UPDATE_COMMAND,
} from '../compat';
import { GradleTasksTreeDataProvider } from '../views/gradleTasks/GradleTasksTreeDataProvider';
import { GradleTaskTreeItem } from '../views/gradleTasks/GradleTaskTreeItem';
import { invalidateTasksCache } from '../tasks/GradleTaskProvider';
import { GradleDaemonsTreeDataProvider } from '../views/gradleDaemons/GradleDaemonsTreeDataProvider';
import { StopDaemonsReply } from '../proto/gradle_pb';
import { GradleDaemonTreeItem } from '../views/gradleDaemons/GradleDaemonTreeItem';
import {
  runTask,
  getTaskExecution,
  runTaskWithArgs,
  cancelTask,
  queueRestartTask,
} from '../tasks/taskUtil';
import {
  focusProjectInGradleTasksTree,
  updateGradleTreeItemStateForTask,
} from '../views/viewUtil';
import {
  COMMAND_SHOW_TASKS,
  COMMAND_RUN_TASK,
  COMMAND_DEBUG_TASK,
  COMMAND_RESTART_TASK,
  COMMAND_RUN_TASK_WITH_ARGS,
  COMMAND_DEBUG_TASK_WITH_ARGS,
  COMMAND_RENDER_TASK,
  COMMAND_CANCEL_TASK,
  COMMAND_CANCEL_TREE_ITEM_TASK,
  COMMAND_REFRESH,
  COMMAND_LOAD_TASKS,
  COMMAND_REFRESH_DAEMON_STATUS,
  COMMAND_STOP_DAEMONS,
  COMMAND_STOP_DAEMON,
  COMMAND_EXPLORER_TREE,
  COMMAND_EXPLORER_FLAT,
  COMMAND_OPEN_SETTINGS,
  COMMAND_OPEN_BUILD_FILE,
  COMMAND_CANCELLING_TREE_ITEM_TASK,
  COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
  COMMAND_SHOW_LOGS,
  COMMAND_BOOKMARK_TASK,
  COMMAND_REMOVE_BOOKMARKED_TASK,
  COMMAND_OPEN_BOOKMARK_HELP,
  COMMAND_BOOKMARK_TASK_WITH_ARGS,
  COMMAND_SHOW_TASK_TERMINAL,
  COMMAND_CLOSE_TASK_TERMINALS,
  // COMMAND_SHOW_TASK_TERMINAL,
  // COMMAND_CLOSE_TASK_TERMINALS,
} from './constants';
import { BookmarkedTasksTreeDataProvider } from '../views/bookmarkedTasks/BookmarkedTasksTreeDataProvider';
// import { RecentTasksTreeDataProvider } from '../views/recentTasks/RecentTasksTreeDataProvider';
// import { TaskTerminalsStore } from '../stores/TaskTerminalsStore';
import { GradleTaskDefinition } from '../tasks/GradleTaskDefinition';
import { getTaskArgs } from '../input';
import { Extension } from '../extension/Extension';
import { RecentTasksTreeDataProvider } from '../views/recentTasks/RecentTasksTreeDataProvider';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json')).toString()
);

function registerShowTasksCommand(
  treeView: vscode.TreeView<vscode.TreeItem>
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_SHOW_TASKS,
    async (uri: vscode.Uri) => {
      focusProjectInGradleTasksTree(treeView, uri);
    }
  );
}

function registerRunTaskCommand(): vscode.Disposable {
  // taskTerminalsStore: TaskTerminalsStore
  return vscode.commands.registerCommand(
    COMMAND_RUN_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTask(treeItem.task /*, taskTerminalsStore*/);
      }
    }
  );
}

function registerDebugTaskCommand(): vscode.Disposable {
  // taskTerminalsStore: TaskTerminalsStore
  return vscode.commands.registerCommand(
    COMMAND_DEBUG_TASK,
    async (treeItem: GradleTaskTreeItem, args = '') => {
      if (treeItem && treeItem.task) {
        runTask(treeItem.task /*, taskTerminalsStore*/, args, true);
      }
    }
  );
}

function registerRestartTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RESTART_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const taskExecution = getTaskExecution(treeItem.task);
        if (taskExecution) {
          queueRestartTask(taskExecution.task);
        }
      }
    }
  );
}

function registerRunTaskWithArgsCommand(): vscode.Disposable {
  // taskTerminalsStore: TaskTerminalsStore
  return vscode.commands.registerCommand(
    COMMAND_RUN_TASK_WITH_ARGS,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTaskWithArgs(treeItem.task /*, taskTerminalsStore*/, false);
      } else {
        logger.error(
          'Unable to run task with args. TreeItem or TreeItem task not found.'
        );
      }
    }
  );
}

function registerDebugTaskWithArgsCommand(): vscode.Disposable {
  // taskTerminalsStore: TaskTerminalsStore
  return vscode.commands.registerCommand(
    COMMAND_DEBUG_TASK_WITH_ARGS,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTaskWithArgs(treeItem.task /*, taskTerminalsStore*/, true);
      } else {
        logger.error(
          'Unable to debug task with args. TreeItem or TreeItem task not found.'
        );
      }
    }
  );
}

function registerRenderTaskCommand(
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider,
  recentTasksTreeDataProvider: RecentTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RENDER_TASK,
    (task: vscode.Task) => {
      updateGradleTreeItemStateForTask(
        task,
        gradleTasksTreeDataProvider,
        bookmarkedTasksTreeDataProvider,
        recentTasksTreeDataProvider
      );
    }
  );
}

function registerCancelTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CANCEL_TASK,
    (task: vscode.Task) => {
      try {
        cancelTask(task);
      } catch (e) {
        logger.error('Error cancelling task:', e.message);
      }
    }
  );
}

function registerCancelTreeItemTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CANCEL_TREE_ITEM_TASK,
    (treeItem) => {
      if (treeItem && treeItem.task) {
        vscode.commands.executeCommand(COMMAND_CANCEL_TASK, treeItem.task);
      }
    }
  );
}

function registerRefreshCommand(
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_REFRESH,
    async (): Promise<void> => {
      invalidateTasksCache();
      await Extension.getInstance().gradleTaskProvider.loadTasks();
      gradleTasksTreeDataProvider.refresh();
    }
  );
}

function registerLoadTasksCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_LOAD_TASKS, () => {
    return Extension.getInstance().gradleTaskProvider.loadTasks();
  });
}

function registerRefreshDaemonStatusCommand(
  gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_REFRESH_DAEMON_STATUS,
    (): void => {
      gradleDaemonsTreeDataProvider.refresh();
    }
  );
}

async function cancelStopDaemons(): Promise<boolean | undefined> {
  const ignoreWarning = getIgnoreDaemonStopWarning();
  if (!ignoreWarning) {
    const DAEMON_STOP_OPTION_CONFIRM = 'Yes';
    const result = await vscode.window.showWarningMessage(
      'Are you sure you want to stop the daemon/s?',
      { modal: true },
      DAEMON_STOP_OPTION_CONFIRM
    );
    if (result !== DAEMON_STOP_OPTION_CONFIRM) {
      return true;
    }
  }
}

function registerStopDaemons(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_STOP_DAEMONS,
    async (): Promise<void> => {
      if (!vscode.workspace.workspaceFolders || (await cancelStopDaemons())) {
        return;
      }
      try {
        const promises: Promise<StopDaemonsReply | void>[] = vscode.workspace.workspaceFolders.map(
          (folder) =>
            Extension.getInstance().client.stopDaemons(folder.uri.fsPath)
        );
        const replies = await Promise.all(promises);
        replies.forEach((reply) => {
          if (reply) {
            logger.info(reply.getMessage());
          }
        });
      } finally {
        vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
      }
    }
  );
}

function registerStopDaemon(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_STOP_DAEMON,
    async (treeItem: GradleDaemonTreeItem): Promise<void> => {
      if (await cancelStopDaemons()) {
        return;
      }
      const pid = treeItem.pid;
      try {
        const stopDaemonReply = await Extension.getInstance().client.stopDaemon(
          pid
        );
        if (stopDaemonReply) {
          logger.info(stopDaemonReply.getMessage());
        }
      } finally {
        vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
      }
    }
  );
}

function registerExplorerTreeCommand(
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_EXPLORER_TREE, () => {
    gradleTasksTreeDataProvider.setCollapsed(false);
  });
}

function registerExplorerFlatCommand(
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_EXPLORER_FLAT, () => {
    gradleTasksTreeDataProvider.setCollapsed(true);
  });
}

function registerOpenSettingsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, (): void => {
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      `@ext:${packageJson.publisher}.${packageJson.name}`
    );
  });
}

function registerOpenBuildFileCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_OPEN_BUILD_FILE,
    (taskItem: GradleTaskTreeItem): void => {
      vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(taskItem.task.definition.buildFile)
      );
    }
  );
}

function registerCancellingTreeItemTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CANCELLING_TREE_ITEM_TASK,
    () => {
      vscode.window.showInformationMessage(
        'Gradle task is cancelling, please wait'
      );
    }
  );
}

function registerUpdateJavaProjectConfigurationCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
    async (buildFile: vscode.Uri) => {
      if (isJavaLanguageSupportExtensionActivated()) {
        try {
          await vscode.commands.executeCommand(
            JAVA_CONFIGURATION_UPDATE_COMMAND,
            buildFile
          );
        } catch (err) {
          logger.error(
            'Unable to update Java project configuration:',
            err.message
          );
        }
      }
    }
  );
}

function registerShowLogsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_SHOW_LOGS, () => {
    logger.getChannel()?.show();
  });
}

function registerBookmarkTaskCommand(
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_BOOKMARK_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        bookmarkedTasksTreeDataProvider.getStore().addEntry(definition.id, '');
      }
    }
  );
}

function registerBookmarkTaskWithArgsCommand(
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_BOOKMARK_TASK_WITH_ARGS,
    async (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const args = await getTaskArgs();
        if (args) {
          const definition = treeItem.task.definition as GradleTaskDefinition;
          bookmarkedTasksTreeDataProvider
            .getStore()
            .addEntry(definition.id, args);
        }
      }
    }
  );
}

function registerRemoveBookmarkedTaskCommand(
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_REMOVE_BOOKMARKED_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        bookmarkedTasksTreeDataProvider
          .getStore()
          .removeEntry(definition.id, definition.args);
      }
    }
  );
}

function registerOpenBookmarkHelpCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_OPEN_BOOKMARK_HELP, () => {
    vscode.window.showInformationMessage(
      'Bookmark your favourite tasks via the task context menu.'
    );
  });
}

function registerShowTaskTerminalCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_SHOW_TASK_TERMINAL,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        const terminalsSet = Extension.getInstance().taskTerminalsStore.getItem(
          definition.id
        );
        if (terminalsSet) {
          const terminals = Array.from(terminalsSet).filter(
            (taskWithTerminal) => {
              return taskWithTerminal.args === definition.args;
            }
          );
          const mostRecentTaskWithTerminal = terminals.pop();
          if (mostRecentTaskWithTerminal) {
            mostRecentTaskWithTerminal.terminal.show();
          }
        }
      }
    }
  );
}

function registerCloseTaskTerminals(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CLOSE_TASK_TERMINALS,
    (treeItem: GradleTaskTreeItem) => {
      const taskTerminalsStore = Extension.getInstance().taskTerminalsStore;
      if (treeItem && treeItem.task) {
        const terminalsStore = taskTerminalsStore.getItem(
          treeItem.task.definition.id
        );
        if (terminalsStore) {
          Array.from(terminalsStore).forEach((taskWithTerminal) =>
            taskWithTerminal.terminal.dispose()
          );
        }
      }
    }
  );
}

export function registerCommands(
  context: vscode.ExtensionContext,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider,
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider,
  recentTasksTreeDataProvider: RecentTasksTreeDataProvider,
  gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>
  // taskTerminalsStore: TaskTerminalsStore
): void {
  context.subscriptions.push(
    registerShowTasksCommand(gradleTasksTreeView),
    registerRunTaskCommand(),
    registerDebugTaskCommand(),
    registerRestartTaskCommand(),
    registerRunTaskWithArgsCommand(),
    registerDebugTaskWithArgsCommand(),
    registerCancelTaskCommand(),
    registerCancelTreeItemTaskCommand(),
    registerRefreshCommand(gradleTasksTreeDataProvider),
    registerRefreshDaemonStatusCommand(gradleDaemonsTreeDataProvider),
    registerStopDaemons(),
    registerStopDaemon(),
    registerExplorerTreeCommand(gradleTasksTreeDataProvider),
    registerExplorerFlatCommand(gradleTasksTreeDataProvider),
    registerOpenSettingsCommand(),
    registerOpenBuildFileCommand(),
    registerCancellingTreeItemTaskCommand(),
    registerRenderTaskCommand(
      gradleTasksTreeDataProvider,
      bookmarkedTasksTreeDataProvider,
      recentTasksTreeDataProvider
    ),
    registerUpdateJavaProjectConfigurationCommand(),
    registerShowLogsCommand(),
    registerLoadTasksCommand(),
    registerBookmarkTaskCommand(bookmarkedTasksTreeDataProvider),
    registerBookmarkTaskWithArgsCommand(bookmarkedTasksTreeDataProvider),
    registerRemoveBookmarkedTaskCommand(bookmarkedTasksTreeDataProvider),
    registerOpenBookmarkHelpCommand(),
    registerShowTaskTerminalCommand(),
    registerCloseTaskTerminals()
  );
}
