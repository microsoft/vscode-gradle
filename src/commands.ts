import * as vscode from 'vscode';
import { GradleTasksTreeDataProvider } from './gradleView';
import {
  stopTask,
  GradleTaskProvider,
  enableTaskDetection,
  stopRunningGradleTasks
} from './tasks';
import { GradleTasksClient } from './client';
import { getIsTasksExplorerEnabled } from './config';

export const runTaskCommand = (
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand(
    'gradle.runTask',
    treeDataProvider.runTask,
    treeDataProvider
  );

export const runTaskWithArgsCommand = (
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand(
    'gradle.runTaskWithArgs',
    treeDataProvider.runTaskWithArgs,
    treeDataProvider
  );

export const stopTaskCommand = (
  statusBarItem: vscode.StatusBarItem
): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.stopTask', task => {
    if (task) {
      stopTask(task);
      statusBarItem.hide();
    }
  });

export const stopTreeItemTaskCommand = (): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.stopTreeItemTask', treeItem => {
    if (treeItem && treeItem.task) {
      vscode.commands.executeCommand('gradle.stopTask', treeItem.task);
    }
  });

export const refreshCommand = (
  taskProvider?: GradleTaskProvider,
  treeDataProvider?: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand(
    'gradle.refresh',
    async (forceDetection = true): Promise<vscode.Task[] | undefined> => {
      if (forceDetection) {
        enableTaskDetection();
      }
      const tasks = await taskProvider?.refresh();
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

export const explorerTreeCommand = (
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.explorerTree', () => {
    treeDataProvider!.setCollapsed(false);
  });

export const explorerFlatCommand = (
  treeDataProvider: GradleTasksTreeDataProvider
): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.explorerFlat', () => {
    treeDataProvider!.setCollapsed(true);
  });

export const killGradleProcessCommand = (
  client: GradleTasksClient,
  statusBarItem: vscode.StatusBarItem
): vscode.Disposable =>
  vscode.commands.registerCommand('gradle.killGradleProcess', () => {
    client.stopGetTasks();
    stopRunningGradleTasks();
    statusBarItem.hide();
  });

export const showGradleProcessInformationMessageCommand = (
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
