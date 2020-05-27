import * as vscode from 'vscode';

import { logger } from '../logger';
import { loadTasksForFolders, createTaskFromDefinition } from './taskUtil';
import { GradleClient } from '../client/GradleClient';
import { GradleTaskDefinition } from './GradleTaskDefinition';

let cachedTasks: vscode.Task[] = [];
const emptyTasks: vscode.Task[] = [];

export function invalidateTasksCache(): void {
  cachedTasks = emptyTasks;
}

export class GradleTaskProvider
  implements vscode.TaskProvider, vscode.Disposable {
  private readonly _onDidTasksLoad: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private readonly _onDidRefreshStart: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private readonly _onDidRefreshStop: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();

  public readonly onDidTasksLoad: vscode.Event<null> = this._onDidTasksLoad
    .event;
  public readonly onDidRefreshStart: vscode.Event<null> = this
    ._onDidRefreshStart.event;
  public readonly onDidRefreshStop: vscode.Event<null> = this._onDidRefreshStop
    .event;
  private loadTasksPromise?: Promise<vscode.Task[]>;

  constructor(private readonly client: GradleClient) {}

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
      projectFolder,
      this.client
    );
  }

  public loadTasks(): Promise<vscode.Task[]> {
    // To accomodate calling loadTasks() on extension activate (when client is connected)
    // and opening the treeview.
    if (this.loadTasksPromise) {
      return this.loadTasksPromise;
    }
    if (cachedTasks.length) {
      return Promise.resolve(cachedTasks);
    }
    logger.debug('Refreshing tasks');
    this._onDidRefreshStart.fire(null);
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      cachedTasks = emptyTasks;
      return Promise.resolve(cachedTasks);
    }
    this.loadTasksPromise = loadTasksForFolders(this.client, folders)
      .then(
        (tasks) => {
          cachedTasks = tasks;
          logger.info(`Found ${cachedTasks.length} tasks`);
        },
        (err) => {
          logger.error('Unable to refresh tasks:', err.message);
          cachedTasks = emptyTasks;
        }
      )
      .then(() => cachedTasks);

    return this.loadTasksPromise.finally(() => {
      this._onDidTasksLoad.fire(null);
      this._onDidRefreshStop.fire(null);
      this.loadTasksPromise = undefined;
    });
  }

  public getTasks(): vscode.Task[] {
    return cachedTasks;
  }

  public dispose(): void {
    this._onDidTasksLoad.dispose();
    this._onDidRefreshStart.dispose();
    this._onDidRefreshStop.dispose();
  }
}
