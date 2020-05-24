import * as vscode from 'vscode';
import { GradleTasksClient } from './client';
import { Output } from './proto/gradle_tasks_pb';
import { logger } from './logger';
import { GradleTasksTreeDataProvider } from './views/GradleTasksTreeDataProvider';
import { GradleTaskProvider } from './tasks/GradleTaskProvider';
import { GradleTaskDefinition } from './tasks/GradleTaskDefinition';

export interface RunTaskOpts {
  projectFolder: string;
  taskName: string;
  args?: ReadonlyArray<string>;
  input?: string;
  onOutput?: (output: Output) => void;
  showOutputColors: boolean;
}

export interface CancelTaskOpts {
  projectFolder: string;
  taskName: string;
}

export class Api {
  // To allow the tests to check for task logs
  public logger = logger;

  constructor(
    private readonly client: GradleTasksClient,
    private readonly taskProvider: GradleTaskProvider,
    private readonly treeDataProvider: GradleTasksTreeDataProvider
  ) {}

  public async runTask(opts: RunTaskOpts): Promise<void> {
    const task = await this.findTask(opts.projectFolder, opts.taskName);
    return this.client.runTask(
      opts.projectFolder,
      task,
      opts.args,
      opts.input,
      0,
      opts.onOutput,
      opts.showOutputColors
    );
  }

  public async cancelRunTask(opts: CancelTaskOpts): Promise<void> {
    const task = await this.findTask(opts.projectFolder, opts.taskName);
    return this.client.cancelRunTask(task);
  }

  private findTask(
    projectFolder: string,
    taskName: string
  ): Promise<vscode.Task> {
    return new Promise((resolve, reject) => {
      this.taskProvider.waitForLoaded(async () => {
        const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
        if (!tasks) {
          return reject(new Error('Unable to load gradle tasks'));
        }
        const task = tasks.find((task) => {
          const definition = task.definition as GradleTaskDefinition;
          return (
            task.name === taskName && definition.projectFolder === projectFolder
          );
        });
        if (!task) {
          return reject(new Error(`Unable to find task: ${taskName}`));
        }
        resolve(task);
      });
    });
  }

  public getTreeProvider(): GradleTasksTreeDataProvider {
    return this.treeDataProvider;
  }

  public waitForLoaded(callback: () => void): void {
    this.taskProvider.waitForLoaded(callback);
  }
}
