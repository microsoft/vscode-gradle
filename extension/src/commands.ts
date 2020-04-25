import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as nls from 'vscode-nls';

import { GradleTasksTreeDataProvider, GradleTaskTreeItem } from './gradleView';
import {
  cancelTask,
  GradleTaskProvider,
  enableTaskDetection,
  runTask,
  runTaskWithArgs,
  cancelRunningGradleTasks,
  restartTask,
} from './tasks';
import { getIsTasksExplorerEnabled } from './config';
import { GradleTasksClient } from './client';
import { logger } from './logger';

const localize = nls.loadMessageBundle();

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json')).toString()
);

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
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
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
        restartTask(treeItem.task);
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

function registerCancelTaskCommand(
  statusBarItem: vscode.StatusBarItem
): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.cancelTask', (task) => {
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
  });
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
    async (forceDetection = true, refreshTasks = true): Promise<void> => {
      if (forceDetection) {
        enableTaskDetection();
      }
      if (refreshTasks) {
        await taskProvider.refresh();
      }
      await treeDataProvider?.refresh();
      vscode.commands.executeCommand(
        'setContext',
        'gradle:showTasksExplorer',
        getIsTasksExplorerEnabled()
      );
    }
  );
}

function registerExplorerRenderCommand(
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.explorerRender', (): void => {
    treeDataProvider.render();
  });
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
        logger.getChannel()?.show();
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

const JAVA_EXTENSION_ID = 'redhat.java';
const JAVA_CONFIGURATION_UPDATE_COMMAND = 'java.projectConfiguration.update';

function isJavaExtActivated(): boolean {
  const javaExt: vscode.Extension<unknown> | undefined = getJavaExtension();
  return !!javaExt && javaExt.isActive;
}

function getJavaExtension(): vscode.Extension<unknown> | undefined {
  return vscode.extensions.getExtension(JAVA_EXTENSION_ID);
}

function registerUpdateJavaProjectConfigurationCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.updateJavaProjectConfiguration',
    async (buildFile: vscode.Uri) => {
      if (isJavaExtActivated()) {
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

export function registerCommands(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem,
  client: GradleTasksClient,
  treeDataProvider: GradleTasksTreeDataProvider,
  taskProvider: GradleTaskProvider
): void {
  context.subscriptions.push(
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
    registerExplorerRenderCommand(treeDataProvider),
    registerUpdateJavaProjectConfigurationCommand()
  );
}
