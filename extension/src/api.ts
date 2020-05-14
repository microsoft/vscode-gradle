import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { GradleTaskProvider, GradleTaskDefinition } from './tasks';
import { GradleTasksClient } from './client';
import { GradleTasksTreeDataProvider } from './gradleView';
import { RunTaskRequest, Output } from './proto/gradle_tasks_pb';
import { logger } from './logger';

const localize = nls.loadMessageBundle();

export interface RunTaskOpts {
  projectFolder: string;
  taskName: string;
  args?: ReadonlyArray<string>;
  input?: string;
  onOutput?: (output: Output) => void;
  showOutputColors: boolean;
  outputStream:
    | typeof RunTaskRequest.OutputStream.BYTES
    | typeof RunTaskRequest.OutputStream.STRING;
}

export interface CancelTaskOpts {
  projectFolder: string;
  taskName: string;
}

export class Api {
  private readonly _onTasksLoaded: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  public onTasksLoaded: vscode.Event<null> = this._onTasksLoaded.event;

  // To allow the tests to check for task logs
  public logger = logger;

  constructor(
    private readonly client: GradleTasksClient,
    private readonly taskProvider: GradleTaskProvider,
    private readonly treeDataProvider: GradleTasksTreeDataProvider
  ) {
    taskProvider.waitForLoaded(() => this._onTasksLoaded.fire(null));
  }

  public async runTask(opts: RunTaskOpts): Promise<void> {
    const task = await this.findTask(opts.projectFolder, opts.taskName);
    return this.client.runTask(
      opts.projectFolder,
      task,
      opts.args,
      opts.input,
      0,
      opts.onOutput,
      opts.showOutputColors,
      opts.outputStream
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
          return reject(
            new Error(
              localize('api.findTaskNoTasks', 'Unable to load gradle tasks')
            )
          );
        }
        const task = tasks.find((task) => {
          const definition = task.definition as GradleTaskDefinition;
          return (
            task.name === taskName && definition.projectFolder === projectFolder
          );
        });
        if (!task) {
          return reject(
            new Error(
              localize(
                'api.findTaskNotFound',
                'Unable to find task: {0}',
                taskName
              )
            )
          );
        }
        resolve(task);
      });
    });
  }

  public getTreeProvider(): GradleTasksTreeDataProvider {
    return this.treeDataProvider;
  }

  dispose(): void {
    this._onTasksLoaded.dispose();
  }
}
