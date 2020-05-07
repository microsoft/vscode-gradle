import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import { Output } from './proto/gradle_tasks_pb';
import { GradleTaskProvider } from './tasks';
import { GradleTasksClient } from './client';
import { RunTaskHandler } from './runTask.d';

const localize = nls.loadMessageBundle();

export { RunTaskHandler };

export function registerRunTask(
  client: GradleTasksClient,
  taskProvider: GradleTaskProvider
): RunTaskHandler {
  return (
    projectFolder: string,
    taskName: string,
    args?: ReadonlyArray<string>,
    showProgress?: boolean,
    onOutput?: (output: Output) => void
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      taskProvider.waitForLoaded(async () => {
        const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
        if (!tasks) {
          return reject(
            new Error(
              localize(
                'extension.runTaskNoTasks',
                'Unable to load gradle tasks'
              )
            )
          );
        }
        const task = tasks.find(({ name }) => name === taskName);
        if (!task) {
          return reject(
            new Error(
              localize(
                'extension.runTaskNotFound',
                'Unable to find task: {0}',
                taskName
              )
            )
          );
        }
        client
          .runTask(projectFolder, task, args, !!showProgress, null, onOutput)
          .then(resolve, reject);
      });
    });
  };
}
