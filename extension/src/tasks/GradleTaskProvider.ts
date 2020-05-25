import * as vscode from 'vscode';

import { logger } from '../logger';
import { EventWaiter } from '../events/EventWaiter';
import { loadTasksForFolders } from './taskUtil';
import { GradleTasksClient } from '../client/GradleTasksClient';
import { COMMAND_REFRESH_DAEMON_STATUS } from '../commands';

let cachedTasks: vscode.Task[] = [];
const emptyTasks: vscode.Task[] = [];

export function invalidateTasksCache(): void {
  cachedTasks = emptyTasks;
}

export class GradleTaskProvider
  implements vscode.TaskProvider, vscode.Disposable {
  private _onTasksLoaded: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  private _onDidRefreshStart: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private _onDidRefreshStop: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private readonly onTasksLoaded: vscode.Event<null> = this._onTasksLoaded
    .event;
  public onDidRefreshStart: vscode.Event<null> = this._onDidRefreshStart.event;
  public onDidRefreshStop: vscode.Event<null> = this._onDidRefreshStop.event;
  public readonly waitForTasksLoaded = new EventWaiter(this.onTasksLoaded).wait;
  private loadTasksPromise?: Promise<vscode.Task[]>;

  constructor(private readonly client: GradleTasksClient) {}

  async provideTasks(): Promise<vscode.Task[] | undefined> {
    return this.loadTasks();
  }

  // TODO
  public async resolveTask(/*
     _task: vscode.Task
  */): Promise<
    vscode.Task | undefined
  > {
    return undefined;
  }

  public loadTasks(): Promise<vscode.Task[]> {
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
      this._onTasksLoaded.fire(null);
      this._onDidRefreshStop.fire(null);
      this.loadTasksPromise = undefined;
      vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
    });
  }

  public getTasks(): vscode.Task[] {
    return cachedTasks;
  }

  public dispose(): void {
    this._onTasksLoaded.dispose();
    this._onDidRefreshStart.dispose();
    this._onDidRefreshStop.dispose();
  }
}
