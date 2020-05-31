import * as vscode from 'vscode';
import { JavaDebug } from '../../config';
import { getTreeItemState } from '..';
import { Extension } from '../../extension';
import { TASK_STATE_RUNNING_REGEX } from '../constants';

export class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly execution?: vscode.TaskExecution;

  protected readonly javaDebug?: JavaDebug;

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
    if (this.contextValue && TASK_STATE_RUNNING_REGEX.test(this.contextValue)) {
      this.iconPath = iconPathRunning;
    } else {
      this.iconPath = iconPathIdle;
    }
  }
}
