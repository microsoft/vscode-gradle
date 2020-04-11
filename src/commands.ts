import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as nls from 'vscode-nls';

import { GradleTasksTreeDataProvider, GradleTaskTreeItem } from './gradleView';
import {
  stopTask,
  GradleTaskProvider,
  enableTaskDetection,
  stopRunningGradleTasks,
  isTaskRunning,
  runTask,
  runTaskWithArgs,
} from './tasks';
import { GradleTasksClient } from './client';
import { getIsTasksExplorerEnabled } from './config';
import { logger } from './logger';

const localize = nls.loadMessageBundle();

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json')).toString()
);

function registerRunTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.runTask',
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTask(treeItem.task);
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

function registerStopTaskCommand(
  statusBarItem: vscode.StatusBarItem
): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.stopTask', (task) => {
    try {
      if (task && isTaskRunning(task)) {
        stopTask(task);
      }
    } catch (e) {
      logger.error(
        localize(
          'commands.errorStoppingTask',
          'Unable to stop task: {0}',
          e.message
        )
      );
    } finally {
      statusBarItem.hide();
    }
  });
}

function registerStopTreeItemTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'gradle.stopTreeItemTask',
    (treeItem) => {
      if (treeItem && treeItem.task) {
        vscode.commands.executeCommand('gradle.stopTask', treeItem.task);
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

function registerKillGradleProcessCommand(
  client: GradleTasksClient,
  statusBarItem: vscode.StatusBarItem
): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.killGradleProcess', () => {
    try {
      client.stopGetTasks();
      stopRunningGradleTasks();
      statusBarItem.hide();
    } catch (e) {
      localize(
        'commands.errorStoppingTasks',
        'Unable to stop tasks: {0}',
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
        vscode.commands.executeCommand('gradle.killGradleProcess');
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

function registerStoppingTreeItemTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('gradle.stoppingTreeItemTask', () => {
    vscode.window.showInformationMessage(
      localize(
        'commands.gradleTaskShuttingDown',
        'Gradle task is shutting down'
      )
    );
  });
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
              'client.updateProjectConfigurationError',
              'Unable to update project configuration: {0}',
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
    registerRunTaskCommand(),
    registerRunTaskWithArgsCommand(client),
    registerStopTaskCommand(statusBarItem),
    registerStopTreeItemTaskCommand(),
    registerRefreshCommand(taskProvider, treeDataProvider),
    registerExplorerTreeCommand(treeDataProvider),
    registerExplorerFlatCommand(treeDataProvider),
    registerKillGradleProcessCommand(client, statusBarItem),
    registerShowProcessMessageCommand(),
    registerOpenSettingsCommand(),
    registerOpenBuildFileCommand(),
    registerStoppingTreeItemTaskCommand(),
    registerExplorerRenderCommand(treeDataProvider),
    registerUpdateJavaProjectConfigurationCommand()
  );
}
