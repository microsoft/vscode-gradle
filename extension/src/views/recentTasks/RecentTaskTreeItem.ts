import * as vscode from 'vscode';
import { GradleTaskTreeItem } from '..';
import { JavaDebug } from '../../config';
import { TaskTerminalsStore } from '../../stores';
import { GradleTaskDefinition } from '../../tasks';
import { buildTaskName } from '../../tasks/taskUtil';
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
    javaDebug: JavaDebug = { tasks: [] },
    private readonly taskTerminalsStore: TaskTerminalsStore
  ) {
    super(parentTreeItem, task, label, description, javaDebug);
  }

  public setContext(): void {
    const definition = this.task.definition as GradleTaskDefinition;
    const taskTerminalsStore = this.taskTerminalsStore.getItem(definition.id);
    const taskTerminals = Array.from(taskTerminalsStore || []);
    const numTerminals = taskTerminals.filter((terminal) => {
      return terminal.args === definition.args;
    }).length;
    const taskName = `${buildTaskName(
      definition as GradleTaskDefinition
    )} (${numTerminals})`;

    this.label = taskName;
    this.contextValue = getRecentTaskTreeItemState(
      getTreeItemState(this.task, this.javaDebug, definition.args),
      numTerminals
    );
    this.setIconState();
  }
}
