import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import { GradleTaskProvider } from './tasks';
import { GradleTasksClient } from './client';
import { RunTaskHandler } from './runTask.d';

const localize = nls.loadMessageBundle();

export { RunTaskHandler };

export function registerRunTask(
  client: GradleTasksClient,
  taskProvider: GradleTaskProvider
): RunTaskHandler {
  return (opts): Promise<void> => {
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
        const task = tasks.find(({ name }) => name === opts.taskName);
        if (!task) {
          return reject(
            new Error(
              localize(
                'extension.runTaskNotFound',
                'Unable to find task: {0}',
                opts.taskName
              )
            )
          );
        }
        client
          .runTask(
            opts.projectFolder,
            task,
            opts.args,
            !!opts.showProgress,
            opts.input,
            0,
            opts.onOutput,
            opts.showOutputColors
          )
          .then(resolve, reject);
      });
    });
  };
}
