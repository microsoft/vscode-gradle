import * as vscode from 'vscode';
import * as path from 'path';
import {
  taskTreeItemMap,
  workspaceJavaDebugMap,
  GradleTasksTreeDataProvider,
} from '../gradleTasks/GradleTasksTreeDataProvider';
import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';
import { BookmarkedTasksStore } from '../../stores/BookmarkedTasksStore';
import { isWorkspaceFolder } from '../../util';
import { BookmarkedWorkspaceTreeItem } from './BookmarkedWorkspaceTreeItem';
import { NoBookmarkedTasksTreeItem } from './NoBookmarkedTasksTreeItem';

export class BookmarkedTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly bookmarkedTasksStore: BookmarkedTasksStore,
    private readonly gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
  ) {
    this.bookmarkedTasksStore.onDidChange(() => this.refresh());
  }

  public getStore(): BookmarkedTasksStore {
    return this.bookmarkedTasksStore;
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public refresh(treeItem: vscode.TreeItem | null = null): void {
    this._onDidChangeTreeData.fire(treeItem);
  }

  public getParent(element: vscode.TreeItem): vscode.TreeItem | null {
    if (element instanceof GradleTaskTreeItem) {
      return element.parentTreeItem || null;
    }
    return null;
  }

  public async getChildren(
    element?: vscode.TreeItem
  ): Promise<vscode.TreeItem[]> {
    if (element instanceof BookmarkedWorkspaceTreeItem) {
      return [...element.tasks];
    }
    if (!element) {
      const treeItems = await this.buildTreeItems();
      if (!treeItems.length) {
        return [new NoBookmarkedTasksTreeItem(this.context)];
      } else {
        return treeItems;
      }
    }
    return [];
  }

  private async buildTreeItems(): Promise<vscode.TreeItem[]> {
    const { workspaceFolders } = vscode.workspace;
    if (!workspaceFolders) {
      return [];
    }
    const bookmarkedTaskIds = this.bookmarkedTasksStore.getTasks();

    const isMultiRoot = workspaceFolders.length > 1;
    const workspaceTreeItemMap: Map<
      string,
      BookmarkedWorkspaceTreeItem
    > = new Map();

    // For performance reasons, we find the associated task via the taskTreeItemMap,
    // so we need to wait for the treeItems to be built first
    await this.gradleTasksTreeDataProvider.waitForBuildTreeItems();

    if (taskTreeItemMap.size === 0) {
      return [];
    }

    bookmarkedTaskIds.forEach((bookmarkedTaskId) => {
      const treeItem = taskTreeItemMap.get(bookmarkedTaskId);
      if (!treeItem) {
        return;
      }
      const task = treeItem.task;
      const definition = task.definition as GradleTaskDefinition;

      if (isWorkspaceFolder(task.scope) && task.definition.buildFile) {
        let workspaceTreeItem = workspaceTreeItemMap.get(task.scope.name);
        if (!workspaceTreeItem) {
          workspaceTreeItem = new BookmarkedWorkspaceTreeItem(task.scope.name);
          workspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
        }

        const label = definition.project + ':' + treeItem.label;
        const bookmarkedTaskTreeItem = new GradleTaskTreeItem(
          workspaceTreeItem,
          task,
          label,
          definition.description,
          treeItem.iconPathRunning!,
          treeItem.iconPathIdle!,
          workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder))
        );
        workspaceTreeItem.addTask(bookmarkedTaskTreeItem);
      }
    });

    if (isMultiRoot) {
      return [...workspaceTreeItemMap.values()];
    } else {
      return [...workspaceTreeItemMap.values().next().value.tasks];
    }
  }
}
