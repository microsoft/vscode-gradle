import * as vscode from 'vscode';
import { EventWaiter } from '../events';
import { GradleTaskDefinition } from '.';
import { logger } from '../logger';
import { createTaskFromDefinition, loadTasksForFolders } from './taskUtil';
import { TaskId } from '../stores/types';

export class GradleTaskProvider
  implements vscode.TaskProvider, vscode.Disposable {
  private cachedTasks: vscode.Task[] = [];
  private readonly _onDidLoadTasks: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private readonly _onDidStartRefresh: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private readonly _onDidStopRefresh: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();

  public readonly onDidLoadTasks: vscode.Event<null> = this._onDidLoadTasks
    .event;
  public readonly onDidStartRefresh: vscode.Event<null> = this
    ._onDidStartRefresh.event;
  public readonly onDidStopRefresh: vscode.Event<null> = this._onDidStopRefresh
    .event;
  private loadTasksPromise?: Promise<vscode.Task[]>;

  public readonly waitForTasksLoad = new EventWaiter(this.onDidLoadTasks).wait;

  public provideTasks(): Promise<vscode.Task[] | undefined> {
    return this.loadTasks();
  }

  public async resolveTask(
    _task: vscode.Task
  ): Promise<vscode.Task | undefined> {
    const { definition } = _task;
    const gradleTaskDefinition = definition as GradleTaskDefinition;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(gradleTaskDefinition.workspaceFolder)
    );
    if (!workspaceFolder) {
      logger.error(
        'Unable to provide Gradle task. Invalid workspace folder: ',
        gradleTaskDefinition.workspaceFolder
      );
      return undefined;
    }
    const projectFolder = vscode.Uri.file(gradleTaskDefinition.projectFolder);
    return createTaskFromDefinition(
      gradleTaskDefinition,
      workspaceFolder,
      projectFolder
    );
  }

  public loadTasks(): Promise<vscode.Task[]> {
    // To accomodate calling loadTasks() on extension activate (when client is connected)
    // and opening the treeview.
    if (this.loadTasksPromise) {
      return this.loadTasksPromise;
    }
    if (this.cachedTasks.length) {
      return Promise.resolve(this.cachedTasks);
    }
    logger.debug('Refreshing tasks');
    this._onDidStartRefresh.fire(null);
    const folders = vscode.workspace.workspaceFolders;

    if (!folders) {
      this.cachedTasks = [];
      return Promise.resolve(this.cachedTasks);
    }

    this.loadTasksPromise = loadTasksForFolders(folders)
      .then(
        (tasks) => {
          this.cachedTasks = tasks;
          logger.info(`Found ${this.cachedTasks.length} tasks`);
        },
        (err) => {
          logger.error('Unable to refresh tasks:', err.message);
          this.cachedTasks = [];
        }
      )
      .then(() => this.cachedTasks);

    return this.loadTasksPromise.finally(() => {
      this._onDidLoadTasks.fire(null);
      this._onDidStopRefresh.fire(null);
      this.loadTasksPromise = undefined;
    });
  }

  public getTasks(): vscode.Task[] {
    return this.cachedTasks;
  }

  public findByTaskId(taskId: TaskId): vscode.Task | void {
    return this.cachedTasks.find((task: vscode.Task) => {
      return task.definition.id === taskId;
    });
  }

  public clearTasksCache(): void {
    this.cachedTasks = [];
  }

  public dispose(): void {
    this._onDidLoadTasks.dispose();
    this._onDidStartRefresh.dispose();
    this._onDidStopRefresh.dispose();
  }
}
