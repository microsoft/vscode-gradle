import * as vscode from 'vscode';

import { GradleTaskProvider } from './GradleTaskProvider';
import { COMMAND_REFRESH, COMMAND_REFRESH_DAEMON_STATUS } from '../commands';
import { isGradleTask, restartQueuedTask } from './taskUtil';
import { GradleTasksClient } from '../client/GradleTasksClient';
import { GradleTaskManager } from './GradleTaskManager';

function handleWorkspaceFoldersChange(): void {
  vscode.commands.executeCommand(COMMAND_REFRESH);
}

export function registerTaskProvider(
  context: vscode.ExtensionContext,
  client: GradleTasksClient
): GradleTaskProvider {
  const provider = new GradleTaskProvider(client);
  context.subscriptions.push(
    provider,
    vscode.tasks.registerTaskProvider('gradle', provider),
    vscode.workspace.onDidChangeWorkspaceFolders(handleWorkspaceFoldersChange),
    vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        restartQueuedTask(task);
        vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
      }
    }),
    vscode.tasks.onDidStartTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
      }
    })
  );
  return provider;
}

export function registerTaskManager(
  context: vscode.ExtensionContext
): GradleTaskManager {
  const taskManager = new GradleTaskManager(context);
  context.subscriptions.push(taskManager);
  return taskManager;
}
