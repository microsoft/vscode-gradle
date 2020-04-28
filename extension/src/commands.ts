import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as nls from 'vscode-nls';

import { GradleTasksTreeDataProvider, GradleTaskTreeItem } from './gradleView';
import {
  cancelTask,
  GradleTaskProvider,
  runTask,
  runTaskWithArgs,
  cancelRunningGradleTasks,
  restartTask,
  getTaskExecution,
} from './tasks';
import { getConfigIsTasksExplorerEnabled } from './config';
import { GradleTasksClient } from './client';
import { logger } from './logger';
import {
  isJavaDebuggerExtensionActivated,
  JAVA_LANGUAGE_EXTENSION_ID,
  JAVA_DEBUGGER_EXTENSION_ID,
  isJavaLanguageSupportExtensionActivated,
  JAVA_CONFIGURATION_UPDATE_COMMAND,
  getJavaDebuggerExtension,
  getJavaLanguageSupportExtension,
} from './compat';

const localize = nls.loadMessageBundle();

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json')).toString()
);

function registerShowTasks(
  treeDataProvider: GradleTasksTreeDataProvider,
  treeView: vscode.TreeView<vscode.TreeItem>
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.showTasks',
    async (uri: vscode.Uri) => {
      const treeItem = treeDataProvider.findProjectTreeItem(uri);
      if (treeItem) {
        await treeView.reveal(treeItem, {
          focus: true,
          expand: true,
        });
      }
    }
  );
}

function registerRunTaskCommand(client: GradleTasksClient): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.runTask',
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTask(treeItem.task, client);
      }
    }
  );
}

function registerDebugTaskCommand(
  client: GradleTasksClient
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.debugTask',
    async (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const INSTALL_EXTENSIONS = localize(
          'commands.requiredExtensionMissing',
          'Install Missing Extensions'
        );
        if (!getJavaLanguageSupportExtension() || !getJavaDebuggerExtension()) {
          const input = await vscode.window.showErrorMessage(
            localize(
              'commands.missingJavaLanguageSupportExtension',
              'The Java Language Support & Debugger extensions are required for debugging.'
            ),
            INSTALL_EXTENSIONS
          );
          if (input === INSTALL_EXTENSIONS) {
            await vscode.commands.executeCommand(
              'workbench.extensions.action.showExtensionsWithIds',
              [JAVA_LANGUAGE_EXTENSION_ID, JAVA_DEBUGGER_EXTENSION_ID]
            );
          }
          return;
        } else if (!isJavaDebuggerExtensionActivated()) {
          vscode.window.showErrorMessage(
            localize(
              'commands.javaDebuggerExtensionNotActivated',
              'La extensión del depurador de Java no está activada.'
            )
          );
          return;
        }
        runTask(treeItem.task, client, true);
      }
    }
  );
}

function registerRestartTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.restartTask',
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const taskExecution = getTaskExecution(treeItem.task);
        if (taskExecution) {
          restartTask(taskExecution.task);
        }
      }
    }
  );
}

function registerRunTaskWithArgsCommand(
  client: GradleTasksClient
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.runTaskWithArgs',
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTaskWithArgs(treeItem.task, client);
      }
    }
  );
}

function registerRenderTaskCommand(
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.renderTask',
    (task: vscode.Task) => {
      treeDataProvider.renderTask(task);
    }
  );
}

function registerCancelTaskCommand(
  statusBarItem: vscode.StatusBarItem
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.cancelTask',
    (task: vscode.Task) => {
      try {
        cancelTask(task);
      } catch (e) {
        logger.error(
          localize(
            'commands.errorCancellingTask',
            'Error cancelling task: {0}',
            e.message
          )
        );
      } finally {
        statusBarItem.hide();
      }
    }
  );
}

function registerCancelTreeItemTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.cancelTreeItemTask',
    (treeItem) => {
      if (treeItem && treeItem.task) {
        vscode.commands.executeCommand('gradle.cancelTask', treeItem.task);
      }
    }
  );
}

function registerRefreshCommand(
  taskProvider: GradleTaskProvider,
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.refresh',
    async (): Promise<void> => {
      const tasks = await taskProvider.refresh();
      treeDataProvider.setTaskItems(tasks);
      treeDataProvider.refresh();
      vscode.commands.executeCommand(
        'setContext',
        'gradle:showTasksExplorer',
        getConfigIsTasksExplorerEnabled()
      );
    }
  );
}

function registerExplorerTreeCommand(
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.explorerTree', () => {
    treeDataProvider!.setCollapsed(false);
  });
}

function registerExplorerFlatCommand(
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.explorerFlat', () => {
    treeDataProvider!.setCollapsed(true);
  });
}

function registerCancelGradleProcessesCommand(
  client: GradleTasksClient,
  statusBarItem: vscode.StatusBarItem
): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.cancelGradleProcesses', () => {
    try {
      client.cancelGetBuilds();
      cancelRunningGradleTasks();
      statusBarItem.hide();
    } catch (e) {
      localize(
        'commands.errorCancellingTasks',
        'Error cancelling tasks: {0}',
        e.message
      );
    }
  });
}

function registerShowProcessMessageCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.showProcessMessage',
    async () => {
      const OPT_LOGS = localize('commands.process.viewLogs', 'View Logs');
      const OPT_CANCEL = localize(
        'commands.process.cancelProcess',
        'Cancel Process'
      );
      const input = await vscode.window.showInformationMessage(
        localize('commands.process.gradleTasksProcess', 'Gradle Tasks Process'),
        OPT_LOGS,
        OPT_CANCEL
      );
      if (input === OPT_LOGS) {
        vscode.commands.executeCommand('gradle.showLogs');
      } else if (input === OPT_CANCEL) {
        vscode.commands.executeCommand('gradle.cancelGradleProcesses');
      }
    }
  );
}

function registerOpenSettingsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.openSettings', (): void => {
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      `@ext:${packageJson.publisher}.${packageJson.name}`
    );
  });
}

function registerOpenBuildFileCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.openBuildFile',
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
    'gradle.cancellingTreeItemTask',
    () => {
      vscode.window.showInformationMessage(
        localize(
          'commands.gradleTaskCancelling',
          'Gradle task is cancelling, please wait'
        )
      );
    }
  );
}

function registerUpdateJavaProjectConfigurationCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.updateJavaProjectConfiguration',
    async (buildFile: vscode.Uri) => {
      if (isJavaLanguageSupportExtensionActivated()) {
        try {
          await vscode.commands.executeCommand(
            JAVA_CONFIGURATION_UPDATE_COMMAND,
            buildFile
          );
        } catch (err) {
          logger.error(
            localize(
              'commands.updateProjectConfigurationError',
              'Unable to update Java project configuration: {0}',
              err.message
            )
          );
        }
      }
    }
  );
}

function registerShowLogsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.showLogs', () => {
    logger.getChannel()?.show();
  });
}

export function registerCommands(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem,
  client: GradleTasksClient,
  treeDataProvider: GradleTasksTreeDataProvider,
  treeView: vscode.TreeView<vscode.TreeItem>,
  taskProvider: GradleTaskProvider
): void {
  context.subscriptions.push(
    registerShowTasks(treeDataProvider, treeView),
    registerRunTaskCommand(client),
    registerDebugTaskCommand(client),
    registerRestartTaskCommand(),
    registerRunTaskWithArgsCommand(client),
    registerCancelTaskCommand(statusBarItem),
    registerCancelTreeItemTaskCommand(),
    registerRefreshCommand(taskProvider, treeDataProvider),
    registerExplorerTreeCommand(treeDataProvider),
    registerExplorerFlatCommand(treeDataProvider),
    registerCancelGradleProcessesCommand(client, statusBarItem),
    registerShowProcessMessageCommand(),
    registerOpenSettingsCommand(),
    registerOpenBuildFileCommand(),
    registerCancellingTreeItemTaskCommand(),
    registerRenderTaskCommand(treeDataProvider),
    registerUpdateJavaProjectConfigurationCommand(),
    registerShowLogsCommand()
  );
}
