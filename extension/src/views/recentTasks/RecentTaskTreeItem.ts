import * as vscode from 'vscode';
import { GradleTaskTreeItem } from '..';
import { JavaDebug } from '../../util/config';
import { Icons } from '../../icons';
import { TaskTerminalsStore } from '../../stores';
import { GradleTaskDefinition } from '../../tasks';
import { getTreeItemState } from '../viewUtil';

function getRecentTaskTreeItemState(
  gradleTaskTreeItemState: string,
  numTerminals: number
): string {
  return numTerminals > 0
    ? `${gradleTaskTreeItemState}WithTerminals`
    : gradleTaskTreeItemState;
}

export class RecentTaskTreeItem extends GradleTaskTreeItem {
  constructor(
    parentTreeItem: vscode.TreeItem,
    task: vscode.Task,
    label: string,
    description: string,
    icons: Icons,
    javaDebug: JavaDebug = { tasks: [], clean: true },
    private readonly taskTerminalsStore: TaskTerminalsStore
  ) {
    // On construction, don't set a description, this will be set in setContext
    super(
      parentTreeItem,
      task,
      label,
      description || label,
      '',
      icons,
      javaDebug
    );
  }

  public setContext(): void {
    const definition = this.task.definition as GradleTaskDefinition;
    this.tooltip =
      (definition.args ? `(args: ${definition.args}) ` : '') +
      (definition.description || this.label);
    const taskTerminalsStore = this.taskTerminalsStore.getItem(
      definition.id + definition.args
    );
    const numTerminals = taskTerminalsStore ? taskTerminalsStore.size : 0;
    this.description = `(${numTerminals})`;
    this.contextValue = getRecentTaskTreeItemState(
      getTreeItemState(this.task, this.javaDebug, definition.args),
      numTerminals
    );
    this.setIconState();
  }
}
