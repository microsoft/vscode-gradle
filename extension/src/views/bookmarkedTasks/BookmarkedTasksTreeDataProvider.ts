import * as vscode from 'vscode';
import * as path from 'path';
import {
  taskTreeItemMap,
  workspaceJavaDebugMap,
} from '../gradleTasks/GradleTasksTreeDataProvider';
import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';
import { treeItemSortCompareFunc } from '../viewUtil';
import { BookmarkedTasksStore } from '../../stores/BookmarkedTasksStore';

function buildBookmarkedTreeItem(
  treeItem: GradleTaskTreeItem
): GradleTaskTreeItem {
  const definition = treeItem.task.definition as GradleTaskDefinition;
  const label = definition.project + ':' + treeItem.label;
  return new GradleTaskTreeItem(
    treeItem.parentTreeItem,
    treeItem.task,
    label,
    definition.description,
    treeItem.iconPathRunning!,
    treeItem.iconPathIdle!,
    workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder))
  );
}

export class BookmarkedTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(private readonly bookmarkedTasksStore: BookmarkedTasksStore) {
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

  public getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    return element
      ? []
      : (this.bookmarkedTasksStore
          .getTasks()
          .map((taskId) => {
            const treeItem = taskTreeItemMap.get(taskId);
            if (treeItem) {
              return buildBookmarkedTreeItem(treeItem);
            }
          })
          .filter(
            (taskItem) => taskItem !== undefined
          ) as GradleTaskTreeItem[]).sort(treeItemSortCompareFunc);
  }
}
