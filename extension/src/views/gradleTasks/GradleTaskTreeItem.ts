import * as vscode from 'vscode';
import { JavaDebug } from '../../config';
import { getTreeItemState } from '../viewUtil';
import { Extension } from '../../extension/Extension';

export class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly execution?: vscode.TaskExecution;

  protected readonly javaDebug?: JavaDebug;

  public static readonly STATE_RUNNING = 'runningTask';
  public static readonly STATE_CANCELLING = 'cancellingTask';
  public static readonly STATE_IDLE = 'task';
  public static readonly STATE_DEBUG_IDLE = 'debugTask';

  public static stateRunningRegex = new RegExp(
    `^${GradleTaskTreeItem.STATE_RUNNING}`
  );

  constructor(
    parentTreeItem: vscode.TreeItem,
    task: vscode.Task,
    label: string,
    description: string,
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
  }

  public setContext(): void {
    this.contextValue = getTreeItemState(this.task, this.javaDebug);
    this.setIconState();
  }

  protected setIconState(): void {
    const {
      iconPathRunning,
      iconPathIdle,
    } = Extension.getInstance().getIcons();
    if (
      this.contextValue &&
      GradleTaskTreeItem.stateRunningRegex.test(this.contextValue)
    ) {
      this.iconPath = iconPathRunning;
    } else {
      this.iconPath = iconPathIdle;
    }
  }
}
