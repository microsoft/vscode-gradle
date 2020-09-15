import * as vscode from 'vscode';
import { Output } from '../proto/gradle_pb';
import { logger } from '../logger';
import { GradleTasksTreeDataProvider } from '../views';
import { GradleTaskDefinition } from '../tasks';
import { GradleClient } from '../client';
import {
  getRunBuildCancellationKey,
  getRunTaskCommandCancellationKey,
} from '../client/CancellationKeys';

export interface RunTaskOpts {
  projectFolder: string;
  taskName: string;
  args?: ReadonlyArray<string>;
  input?: string;
  onOutput?: (output: Output) => void;
  showOutputColors: boolean;
}

export interface RunBuildOpts {
  projectFolder: string;
  args: ReadonlyArray<string>;
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
    const taskArgs = (opts.args || []).filter(Boolean);
    const task = await this.findTask(opts.projectFolder, opts.taskName);
    const runBuildArgs = [opts.taskName].concat(taskArgs);
    const runBuildOpts = {
      ...opts,
      args: runBuildArgs,
    };
    return this.runBuild(runBuildOpts, task);
  }

  public async runBuild(opts: RunBuildOpts, task?: vscode.Task): Promise<void> {
    const cancellationKey = getRunBuildCancellationKey(
      opts.projectFolder,
      opts.args
    );
    return this.client.runBuild(
      opts.projectFolder,
      cancellationKey,
      opts.args,
      opts.input,
      0,
      task,
      opts.onOutput,
      opts.showOutputColors
    );
  }

  public async cancelRunTask(opts: CancelTaskOpts): Promise<void> {
    const task = await this.findTask(opts.projectFolder, opts.taskName);
    const cancellationKey = getRunTaskCommandCancellationKey(
      opts.projectFolder,
      opts.taskName
    );
    return this.client.cancelBuild(cancellationKey, task);
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
