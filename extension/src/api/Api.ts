import * as vscode from 'vscode';
import { Output } from '../proto/gradle_pb';
import { logger } from '../logger';
import { GradleTasksTreeDataProvider } from '../views';
import { GradleTaskDefinition } from '../tasks';
import { GradleClient } from '../client';

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
  public readonly logger = logger;

  constructor(
    private readonly client: GradleClient,
    private readonly tasksTreeDataProvider: GradleTasksTreeDataProvider
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

  private async findTask(
    projectFolder: string,
    taskName: string
  ): Promise<vscode.Task> {
    const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
    if (!tasks) {
      throw new Error('Unable to load gradle tasks');
    }
    const foundTask = tasks.find((task) => {
      const definition = task.definition as GradleTaskDefinition;
      return (
        task.name === taskName && definition.projectFolder === projectFolder
      );
    });
    if (!foundTask) {
      throw new Error(`Unable to find task: ${taskName}`);
    }
    return foundTask;
  }

  public getTasksTreeProvider(): GradleTasksTreeDataProvider {
    return this.tasksTreeDataProvider;
  }
}
