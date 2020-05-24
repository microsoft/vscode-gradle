import * as vscode from 'vscode';
import { IconPath } from './types';
import { JavaDebug } from '../config';
import { isTaskCancelling, isTaskRunning } from '../tasks';

function getTreeItemState(task: vscode.Task, javaDebug?: JavaDebug): string {
  // A task can be running but in a cancelling state
  if (isTaskCancelling(task)) {
    return GradleTaskTreeItem.STATE_CANCELLING;
  }
  if (isTaskRunning(task)) {
    return GradleTaskTreeItem.STATE_RUNNING;
  }
  return javaDebug && javaDebug.tasks.includes(task.definition.script)
    ? GradleTaskTreeItem.STATE_DEBUG_IDLE
    : GradleTaskTreeItem.STATE_IDLE;
}

export class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly execution?: vscode.TaskExecution;

  private readonly iconPathRunning?: IconPath;
  private readonly iconPathIdle?: IconPath;
  private readonly javaDebug?: JavaDebug;

  public static STATE_RUNNING = 'runningTask';
  public static STATE_CANCELLING = 'cancellingTask';
  public static STATE_IDLE = 'task';
  public static STATE_DEBUG_IDLE = 'debugTask';

  constructor(
    parentTreeItem: vscode.TreeItem,
    task: vscode.Task,
    label: string,
    description: string,
    iconPathRunning: IconPath,
    iconPathIdle: IconPath,
    javaDebug?: JavaDebug
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: 'Run Task',
      command: 'gradle.openBuildFile',
      arguments: [this],
    };
    this.tooltip = description || label;
    this.parentTreeItem = parentTreeItem;
    this.task = task;
    this.javaDebug = javaDebug;
    this.iconPathRunning = iconPathRunning;
    this.iconPathIdle = iconPathIdle;
    this.setContext();
  }

  setContext(): void {
    this.contextValue = getTreeItemState(this.task, this.javaDebug);
    if (this.contextValue === GradleTaskTreeItem.STATE_RUNNING) {
      this.iconPath = this.iconPathRunning;
    } else {
      this.iconPath = this.iconPathIdle;
    }
  }
}
