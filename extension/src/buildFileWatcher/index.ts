import * as vscode from 'vscode';
import { GradleTaskProvider } from '../tasks/GradleTaskProvider';
import { GradleTaskManager } from '../tasks/GradleTaskManager';
import { BuildFileWatcher } from './BuildFileWatcher';
import { COMMAND_REFRESH } from '../commands/constants';

export function registerBuildFileWatcher(
  context: vscode.ExtensionContext,
  taskProvider: GradleTaskProvider,
  taskManager: GradleTaskManager
): BuildFileWatcher {
  const buildFileWatcher = new BuildFileWatcher();
  buildFileWatcher.addHandler(() => {
    vscode.commands.executeCommand(COMMAND_REFRESH);
  });

  taskProvider.onDidRefreshStart(() => buildFileWatcher.stop());
  taskProvider.onDidRefreshStop(() => buildFileWatcher.start());

  taskManager.onDidEndAllTasks(() => buildFileWatcher.start());
  taskManager.onDidStartTask(() => {
    buildFileWatcher.stop();
  });

  context.subscriptions.push(buildFileWatcher);
  return buildFileWatcher;
}
