import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GradleTasksTreeDataProvider, GradleTaskTreeItem } from './gradleView';
import {
  stopTask,
  GradleTaskProvider,
  enableTaskDetection,
  stopRunningGradleTasks,
  isTaskRunning
} from './tasks';
import { GradleTasksClient } from './client';
import { getIsTasksExplorerEnabled } from './config';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json')).toString()
);

export const registerRunTaskCommand = (
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand(
    'gradle.runTask',
    treeDataProvider.runTask,
    treeDataProvider
  );

export const registerRunTaskWithArgsCommand = (
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand(
    'gradle.runTaskWithArgs',
    treeDataProvider.runTaskWithArgs,
    treeDataProvider
  );

export const registerStopTaskCommand = (
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel
): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.stopTask', task => {
    try {
      if (task && isTaskRunning(task)) {
        stopTask(task);
      }
      statusBarItem.hide();
    } catch (e) {
      outputChannel.appendLine(`Unable to stop task: ${e.message}`);
    }
  });

export const registerStopTreeItemTaskCommand = (): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.stopTreeItemTask', treeItem => {
    if (treeItem && treeItem.task) {
      vscode.commands.executeCommand('gradle.stopTask', treeItem.task);
    }
  });

export const registerRefreshCommand = (
  taskProvider: GradleTaskProvider,
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand(
    'gradle.refresh',
    async (forceDetection = true): Promise<vscode.Task[] | undefined> => {
      if (forceDetection) {
        enableTaskDetection();
      }
      const tasks = await taskProvider.refresh();
      await treeDataProvider?.refresh();
      if (getIsTasksExplorerEnabled()) {
        vscode.commands.executeCommand(
          'setContext',
          'gradle:showTasksExplorer',
          true
        );
      }
      return tasks;
    }
  );

export const registerExplorerTreeCommand = (
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.explorerTree', () => {
    treeDataProvider!.setCollapsed(false);
  });

export const registerExplorerFlatCommand = (
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.explorerFlat', () => {
    treeDataProvider!.setCollapsed(true);
  });

export const registerKillGradleProcessCommand = (
  client: GradleTasksClient,
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel
): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.killGradleProcess', () => {
    try {
      client.stopGetTasks();
      stopRunningGradleTasks();
      statusBarItem.hide();
    } catch (e) {
      outputChannel.appendLine(`Unable to stop tasks: ${e.message}`);
    }
  });

export const registerShowGradleProcessInformationMessageCommand = (
  outputChannel: vscode.OutputChannel
): vscode.Disposable =>
  vscode.commands.registerCommand(
    'gradle.showGradleProcessInformationMessage',
    async () => {
      const OPT_LOGS = 'View Logs';
      const OPT_CANCEL = 'Cancel Process';
      const input = await vscode.window.showInformationMessage(
        'Gradle Tasks Process',
        OPT_LOGS,
        OPT_CANCEL
      );
      if (input === OPT_LOGS) {
        outputChannel.show();
      } else if (input === OPT_CANCEL) {
        vscode.commands.executeCommand('gradle.killGradleProcess');
      }
    }
  );

export const registerOpenSettingsCommand = (): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.openSettings', (): void => {
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      `@ext:${packageJson.publisher}.${packageJson.name}`
    );
  });

export const registerOpenBuildFileCommand = (): vscode.Disposable =>
  vscode.commands.registerCommand(
    'gradle.openBuildFile',
    (taskItem: GradleTaskTreeItem): void => {
      vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(taskItem.task.definition.buildFile)
      );
    }
  );

export const registerStoppingTreeItemTaskCommand = (): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.stoppingTreeItemTask', () => {
    vscode.window.showInformationMessage(`Gradle task is shutting down`);
  });
