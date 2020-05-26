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
import {
  GradleTaskProvider,
  invalidateTasksCache,
} from '../tasks/GradleTaskProvider';
import { GradleDaemonsTreeDataProvider } from '../views/gradleDaemons/GradleDaemonsTreeDataProvider';
import { StopDaemonsReply } from '../proto/gradle_pb';
import { GradleDaemonTreeItem } from '../views/gradleDaemons/GradleDaemonTreeItem';
import { GradleClient } from '../client/GradleClient';
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
} from './constants';
import { BookmarkedTasksTreeDataProvider } from '../views/bookmarkedTasks/BookmarkedTasksTreeDataProvider';

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

function registerRunTaskCommand(client: GradleClient): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RUN_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTask(treeItem.task, client);
      }
    }
  );
}

function registerDebugTaskCommand(client: GradleClient): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_DEBUG_TASK,
    async (treeItem: GradleTaskTreeItem, args = '') => {
      if (treeItem && treeItem.task) {
        runTask(treeItem.task, client, args, true);
      }
    }
  );
}

function registerRestartTaskCommand(
  client: GradleClient,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RESTART_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const taskExecution = getTaskExecution(treeItem.task);
        if (taskExecution) {
          queueRestartTask(
            client,
            gradleTasksTreeDataProvider,
            bookmarkedTasksTreeDataProvider,
            taskExecution.task
          );
        }
      }
    }
  );
}

function registerRunTaskWithArgsCommand(
  client: GradleClient
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RUN_TASK_WITH_ARGS,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTaskWithArgs(treeItem.task, client, false);
      } else {
        logger.error(
          'Unable to run task with args. TreeItem or TreeItem task not found.'
        );
      }
    }
  );
}

function registerDebugTaskWithArgsCommand(
  client: GradleClient
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_DEBUG_TASK_WITH_ARGS,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTaskWithArgs(treeItem.task, client, true);
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
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RENDER_TASK,
    (task: vscode.Task) => {
      updateGradleTreeItemStateForTask(
        task,
        gradleTasksTreeDataProvider,
        bookmarkedTasksTreeDataProvider
      );
    }
  );
}

function registerCancelTaskCommand(
  client: GradleClient,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CANCEL_TASK,
    (task: vscode.Task) => {
      try {
        cancelTask(
          client,
          gradleTasksTreeDataProvider,
          bookmarkedTasksTreeDataProvider,
          task
        );
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
  taskProvider: GradleTaskProvider,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_REFRESH,
    async (): Promise<void> => {
      invalidateTasksCache();
      await taskProvider.loadTasks();
      gradleTasksTreeDataProvider.refresh();
    }
  );
}

function registerLoadTasksCommand(
  taskProvider: GradleTaskProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_LOAD_TASKS, () => {
    return taskProvider.loadTasks();
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

function registerStopDaemons(client: GradleClient): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_STOP_DAEMONS,
    async (): Promise<void> => {
      if (!vscode.workspace.workspaceFolders || (await cancelStopDaemons())) {
        return;
      }
      try {
        const promises: Promise<StopDaemonsReply | void>[] = vscode.workspace.workspaceFolders.map(
          (folder) => client.stopDaemons(folder.uri.fsPath)
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

function registerStopDaemon(client: GradleClient): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_STOP_DAEMON,
    async (treeItem: GradleDaemonTreeItem): Promise<void> => {
      if (await cancelStopDaemons()) {
        return;
      }
      const pid = treeItem.pid;
      try {
        const stopDaemonReply = await client.stopDaemon(pid);
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
        bookmarkedTasksTreeDataProvider
          .getStore()
          .addTask(treeItem.task.definition.id);
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
        bookmarkedTasksTreeDataProvider
          .getStore()
          .removeTask(treeItem.task.definition.id);
      }
    }
  );
}

export function registerCommands(
  context: vscode.ExtensionContext,
  client: GradleClient,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider,
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider,
  treeView: vscode.TreeView<vscode.TreeItem>,
  taskProvider: GradleTaskProvider
): void {
  context.subscriptions.push(
    registerShowTasksCommand(treeView),
    registerRunTaskCommand(client),
    registerDebugTaskCommand(client),
    registerRestartTaskCommand(
      client,
      gradleTasksTreeDataProvider,
      bookmarkedTasksTreeDataProvider
    ),
    registerRunTaskWithArgsCommand(client),
    registerDebugTaskWithArgsCommand(client),
    registerCancelTaskCommand(
      client,
      gradleTasksTreeDataProvider,
      bookmarkedTasksTreeDataProvider
    ),
    registerCancelTreeItemTaskCommand(),
    registerRefreshCommand(taskProvider, gradleTasksTreeDataProvider),
    registerRefreshDaemonStatusCommand(gradleDaemonsTreeDataProvider),
    registerStopDaemons(client),
    registerStopDaemon(client),
    registerExplorerTreeCommand(gradleTasksTreeDataProvider),
    registerExplorerFlatCommand(gradleTasksTreeDataProvider),
    registerOpenSettingsCommand(),
    registerOpenBuildFileCommand(),
    registerCancellingTreeItemTaskCommand(),
    registerRenderTaskCommand(
      gradleTasksTreeDataProvider,
      bookmarkedTasksTreeDataProvider
    ),
    registerUpdateJavaProjectConfigurationCommand(),
    registerShowLogsCommand(),
    registerLoadTasksCommand(taskProvider),
    registerBookmarkTaskCommand(bookmarkedTasksTreeDataProvider),
    registerRemoveBookmarkedTaskCommand(bookmarkedTasksTreeDataProvider)
  );
}
