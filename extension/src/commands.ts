import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { getIgnoreDaemonStopWarning } from './config';
import { logger } from './logger';
import {
  isJavaLanguageSupportExtensionActivated,
  JAVA_CONFIGURATION_UPDATE_COMMAND,
} from './compat';
import { GradleTasksTreeDataProvider } from './views/GradleTasksTreeDataProvider';
import { GradleTaskTreeItem } from './views/GradleTaskTreeItem';
import {
  GradleTaskProvider,
  invalidateTasksCache,
} from './tasks/GradleTaskProvider';
import { GradleDaemonsTreeDataProvider } from './views/GradleDaemonsTreeDataProvider';
import { StopDaemonsReply } from './proto/gradle_pb';
import { GradleDaemonTreeItem } from './views/GradleDaemonTreeItem';
import { GradleClient } from './client/GradleClient';
import {
  runTask,
  getTaskExecution,
  runTaskWithArgs,
  cancelTask,
  queueRestartTask,
} from './tasks/taskUtil';
import { focusProjectInGradleTasksTree } from './views/viewUtil';

export const COMMAND_SHOW_TASKS = 'gradle.showTasks';
export const COMMAND_RUN_TASK = 'gradle.runTask';
export const COMMAND_DEBUG_TASK = 'gradle.debugTask';
export const COMMAND_RESTART_TASK = 'gradle.restartTask';
export const COMMAND_RUN_TASK_WITH_ARGS = 'gradle.runTaskWithArgs';
export const COMMAND_DEBUG_TASK_WITH_ARGS = 'gradle.debugTaskWithArgs';
export const COMMAND_RENDER_TASK = 'gradle.renderTask';
export const COMMAND_CANCEL_TASK = 'gradle.cancelTask';
export const COMMAND_CANCEL_TREE_ITEM_TASK = 'gradle.cancelTreeItemTask';
export const COMMAND_REFRESH = 'gradle.refresh';
export const COMMAND_REFRESH_DAEMON_STATUS = 'gradle.refreshDaemonStatus';
export const COMMAND_OPEN_BUILD_FILE = 'gradle.openBuildFile';
export const COMMAND_EXPLORER_TREE = 'gradle.explorerTree';
export const COMMAND_EXPLORER_FLAT = 'gradle.explorerFlat';
export const COMMAND_OPEN_SETTINGS = 'gradle.openSettings';
export const COMMAND_CANCELLING_TREE_ITEM_TASK =
  'gradle.cancellingTreeItemTask';
export const COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION =
  'gradle.updateJavaProjectConfiguration';
export const COMMAND_SHOW_LOGS = 'gradle.showLogs';
export const COMMAND_STOP_DAEMONS = 'gradle.stopDaemons';
export const COMMAND_STOP_DAEMON = 'gradle.stopDaemon';
export const COMMAND_LOAD_TASKS = 'gradle.loadTasks';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json')).toString()
);

function registerShowTasks(
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
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
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
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
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RENDER_TASK,
    (task: vscode.Task) => {
      gradleTasksTreeDataProvider.renderTask(task);
    }
  );
}

function registerCancelTaskCommand(
  client: GradleClient,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CANCEL_TASK,
    (task: vscode.Task) => {
      try {
        cancelTask(client, gradleTasksTreeDataProvider, task);
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
    gradleTasksTreeDataProvider!.setCollapsed(false);
  });
}

function registerExplorerFlatCommand(
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_EXPLORER_FLAT, () => {
    gradleTasksTreeDataProvider!.setCollapsed(true);
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

export function registerCommands(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem,
  client: GradleClient,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider,
  treeView: vscode.TreeView<vscode.TreeItem>,
  taskProvider: GradleTaskProvider
): void {
  context.subscriptions.push(
    registerShowTasks(gradleTasksTreeDataProvider, treeView),
    registerRunTaskCommand(client),
    registerDebugTaskCommand(client),
    registerRestartTaskCommand(client, gradleTasksTreeDataProvider),
    registerRunTaskWithArgsCommand(client),
    registerDebugTaskWithArgsCommand(client),
    registerCancelTaskCommand(client, gradleTasksTreeDataProvider),
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
    registerRenderTaskCommand(gradleTasksTreeDataProvider),
    registerUpdateJavaProjectConfigurationCommand(),
    registerShowLogsCommand(),
    registerLoadTasksCommand(taskProvider)
  );
}
