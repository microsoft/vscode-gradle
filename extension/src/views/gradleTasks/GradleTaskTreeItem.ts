import * as vscode from 'vscode';
import { IconPath } from '../types';
import { JavaDebug } from '../../config';
import { getTreeItemState } from '../viewUtil';

export class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly execution?: vscode.TaskExecution;
  public readonly iconPathRunning?: IconPath;
  public readonly iconPathIdle?: IconPath;

  protected readonly javaDebug?: JavaDebug;

  public static readonly STATE_RUNNING = 'runningTask';
  public static readonly STATE_CANCELLING = 'cancellingTask';
  public static readonly STATE_IDLE = 'task';
  public static readonly STATE_DEBUG_IDLE = 'debugTask';

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

  public setContext(): void {
    this.contextValue = getTreeItemState(this.task, this.javaDebug);
    this.setIconState();
  }

  protected setIconState(): void {
    if (this.contextValue === GradleTaskTreeItem.STATE_RUNNING) {
      this.iconPath = this.iconPathRunning;
    } else {
      this.iconPath = this.iconPathIdle;
    }
  }
}
