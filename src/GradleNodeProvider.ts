import {
  Event,
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  ExtensionContext
} from 'vscode';

import TaskRegistry from './TaskRegistry';
import GradleTreeItem from './GradeTreeItem';

export default class TreeProvider implements TreeDataProvider<GradleTreeItem> {
  private readonly _onDidChangeTreeData: EventEmitter<
    GradleTreeItem
  > = new EventEmitter<GradleTreeItem>();

  readonly onDidChangeTreeData: Event<GradleTreeItem> = this
    ._onDidChangeTreeData.event;

  constructor(public readonly context: ExtensionContext) {}

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GradleTreeItem): TreeItem {
    return element;
  }

  getChildren(): GradleTreeItem[] {
    return this.renderGradleTasks();
  }

  private renderGradleTasks(): GradleTreeItem[] {
    return TaskRegistry.getTasks().map(task => {
      const cmdObject = {
        title: 'Run Gradle Task',
        command: 'gradle:runtask',
        arguments: [task.label]
      };

      return new GradleTreeItem(
        this.context,
        task.label,
        TreeItemCollapsibleState.None,
        `Run ${task.label}`,
        cmdObject
      );
    });
  }
}
