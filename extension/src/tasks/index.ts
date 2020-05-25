import * as vscode from 'vscode';

import { GradleTaskProvider } from './GradleTaskProvider';
import { COMMAND_REFRESH } from '../commands';
import { isGradleTask, restartQueuedTask } from './taskUtil';
import { GradleClient } from '../client/GradleClient';
import { GradleTaskManager } from './GradleTaskManager';

function handleWorkspaceFoldersChange(): void {
  vscode.commands.executeCommand(COMMAND_REFRESH);
}

export function registerTaskProvider(
  context: vscode.ExtensionContext,
  client: GradleClient
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
