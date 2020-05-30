import * as vscode from 'vscode';
import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { getTreeItemState } from '../viewUtil';
import { JavaDebug } from '../../config';
import { TaskTerminalsStore } from '../../stores/TaskTerminalsStore';
import { buildTaskName } from '../../tasks/taskUtil';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';

function getRecentTaskTreeItemState(
  gradleTaskTreeItemState: string,
  numTerminals: number
): string {
  if (numTerminals > 0) {
    return gradleTaskTreeItemState;
  } else {
    return `${gradleTaskTreeItemState}WithoutTerminals`;
  }
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
    const taskTerminalsStore = this.taskTerminalsStore.getItem(
      this.task.definition.id
    );
    const taskTerminals = Array.from(taskTerminalsStore || []);
    const numTerminals = taskTerminals.filter((terminal) => {
      return terminal.args === this.task.definition.args;
    }).length;
    const taskName = `${buildTaskName(
      this.task.definition as GradleTaskDefinition
    )} (${numTerminals})`;

    this.label = taskName;
    this.contextValue = getRecentTaskTreeItemState(
      getTreeItemState(this.task, this.javaDebug, this.task.definition.args),
      numTerminals
    );
    this.setIconState();
  }
}
