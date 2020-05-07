import * as vscode from 'vscode';
import { isGradleTask, getRunningGradleTasks } from './tasks';

export class GradleTaskManager implements vscode.Disposable {
  private _onDidStartTask: vscode.EventEmitter<
    vscode.Task
  > = new vscode.EventEmitter<vscode.Task>();

  private _onDidEndAllTasks: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();

  public onDidStartTask: vscode.Event<vscode.Task> = this._onDidStartTask.event;
  public onDidEndAllTasks: vscode.Event<null> = this._onDidEndAllTasks.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.context.subscriptions.push(
      vscode.tasks.onDidStartTask((e: vscode.TaskStartEvent) => {
        if (isGradleTask(e.execution.task)) {
          this._onDidStartTask.fire(e.execution.task);
        }
      }),
      vscode.tasks.onDidEndTask((e: vscode.TaskEndEvent) => {
        if (
          isGradleTask(e.execution.task) &&
          getRunningGradleTasks().length === 0
        ) {
          this._onDidEndAllTasks.fire();
        }
      })
    );
  }

  dispose(): void {
    this._onDidStartTask.dispose();
    this._onDidEndAllTasks.dispose();
  }
}

export function registerTaskManager(
  context: vscode.ExtensionContext
): GradleTaskManager {
  const taskManager = new GradleTaskManager(context);
  context.subscriptions.push(taskManager);
  return taskManager;
}
