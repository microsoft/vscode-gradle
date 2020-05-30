import * as vscode from 'vscode';
import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { getTreeItemState } from '../viewUtil';
import { JavaDebug } from '../../config';

function getRecentTaskTreeItemState(
  gradleTaskTreeItemState: string,
  numTerminals: number
): string {
  if (numTerminals > 0) {
    return gradleTaskTreeItemState;
  }
  // A task can only have no terminals if it's IDLE
  // TODO: handle debug tasks
  return RecentTaskTreeItem.STATE_IDLE_WITHOUT_TERMINALS;
}

export class RecentTaskTreeItem extends GradleTaskTreeItem {
  public static readonly STATE_IDLE_WITHOUT_TERMINALS = 'taskWithoutTerminals';
  constructor(
    parentTreeItem: vscode.TreeItem,
    task: vscode.Task,
    label: string,
    description: string,
    javaDebug: JavaDebug = { tasks: [] },
    private readonly numTerminals: number
  ) {
    super(parentTreeItem, task, label, description, javaDebug);
  }

  public setContext(): void {
    this.contextValue = getRecentTaskTreeItemState(
      getTreeItemState(this.task, this.javaDebug, this.task.definition.args),
      this.numTerminals
    );
    this.setIconState();
  }
}
