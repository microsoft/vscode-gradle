import * as vscode from 'vscode';

import { GradleTaskProvider } from './GradleTaskProvider';
import { isGradleTask, restartQueuedTask } from './taskUtil';
import { GradleTaskManager } from './GradleTaskManager';
import { COMMAND_REFRESH } from '../commands/constants';
import { RecentTasksStore } from '../stores/RecentTasksStore';
import { GradleTaskDefinition } from './GradleTaskDefinition';
// import { TaskTerminalsStore } from '../stores/TaskTerminalsStore';

function handleWorkspaceFoldersChange(): void {
  vscode.commands.executeCommand(COMMAND_REFRESH);
}

export function registerTaskProvider(
  context: vscode.ExtensionContext
  // taskTerminalsStore: TaskTerminalsStore
): GradleTaskProvider {
  const provider = new GradleTaskProvider(/*, taskTerminalsStore*/);
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
  context: vscode.ExtensionContext,
  recentTasksStore: RecentTasksStore
): GradleTaskManager {
  const taskManager = new GradleTaskManager(context);
  context.subscriptions.push(taskManager);

  taskManager.onDidStartTask((task: vscode.Task) => {
    const definition = task.definition as GradleTaskDefinition;
    recentTasksStore.addEntry(definition.id, definition.args);
  });
  return taskManager;
}
