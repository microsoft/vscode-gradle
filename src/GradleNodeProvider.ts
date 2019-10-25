import {
  Event,
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  ExtensionContext
} from 'vscode';

import GradleTaskRegistry from './GradleTaskRegistry';
import GradleTreeItem from './GradeTreeItem';

export default class TreeProvider implements TreeDataProvider<GradleTreeItem> {
  private readonly _onDidChangeTreeData: EventEmitter<
    GradleTreeItem
  > = new EventEmitter<GradleTreeItem>();

  readonly onDidChangeTreeData: Event<GradleTreeItem> = this
    ._onDidChangeTreeData.event;

  constructor(
    readonly context: ExtensionContext,
    readonly taskRegistry: GradleTaskRegistry
  ) {
    taskRegistry.registerChangeHandler(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: GradleTreeItem): TreeItem {
    return element;
  }

  getChildren(): GradleTreeItem[] {
    return this.renderGradleTasks();
  }

  private renderGradleTasks(): GradleTreeItem[] {
    return this.taskRegistry.getTasks().map(task => {
      const cmdObject = {
        title: 'Run Gradle Task',
        command: 'gradle:runtask',
        arguments: [task.name]
      };

      return new GradleTreeItem(
        this.context,
        task.name,
        TreeItemCollapsibleState.None,
        `Run ${task.name}`,
        cmdObject
      );
    });
  }
}
