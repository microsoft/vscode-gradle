import * as vscode from 'vscode';
import * as path from 'path';
import {
  taskTreeItemMap,
  workspaceJavaDebugMap,
  GradleTasksTreeDataProvider,
} from '../gradleTasks/GradleTasksTreeDataProvider';
import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { BookmarkedTasksStore } from '../../stores/BookmarkedTasksStore';
import { isWorkspaceFolder } from '../../util';
import { BookmarkedWorkspaceTreeItem } from './BookmarkedWorkspaceTreeItem';
import { NoBookmarkedTasksTreeItem } from './NoBookmarkedTasksTreeItem';
import { TaskId, TaskArgs } from '../../stores/types';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';
import { cloneTask } from '../../tasks/taskUtil';
import { BookmarkedTaskTreeItem } from './BookmarkedTaskTreeItem';

function buildTaskTreeItem(
  workspaceTreeItem: BookmarkedWorkspaceTreeItem,
  treeItem: GradleTaskTreeItem,
  task: vscode.Task
): GradleTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  return new BookmarkedTaskTreeItem(
    workspaceTreeItem,
    task,
    task.name,
    definition.description,
    treeItem.iconPathRunning!,
    treeItem.iconPathIdle!,
    workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder))
  );
}

function buildWorkspaceTreeItem(
  workspaceTreeItemMap: Map<string, BookmarkedWorkspaceTreeItem>,
  treeItem: GradleTaskTreeItem,
  task: vscode.Task
): void {
  if (isWorkspaceFolder(task.scope) && task.definition.buildFile) {
    let workspaceTreeItem = workspaceTreeItemMap.get(task.scope.name);
    if (!workspaceTreeItem) {
      workspaceTreeItem = new BookmarkedWorkspaceTreeItem(task.scope.name);
      workspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
    }

    const bookmarkedTaskTreeItem = buildTaskTreeItem(
      workspaceTreeItem,
      treeItem,
      task
    );

    workspaceTreeItem.addTask(bookmarkedTaskTreeItem);
  }
}

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

    const bookmarkedTasks = this.bookmarkedTasksStore.getData();
    Array.from(bookmarkedTasks.keys()).forEach((taskId: TaskId) => {
      const treeItem = taskTreeItemMap.get(taskId);
      if (!treeItem) {
        return;
      }
      const taskArgs = bookmarkedTasks.get(taskId) || '';
      if (taskArgs) {
        Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
          const task = cloneTask(
            treeItem.task,
            args,
            treeItem.task.definition.javaDebug
          );
          buildWorkspaceTreeItem(workspaceTreeItemMap, treeItem, task);
        });
      }
    });

    if (!workspaceTreeItemMap.size) {
      return [];
    } else if (isMultiRoot) {
      return [...workspaceTreeItemMap.values()];
    } else {
      return [...workspaceTreeItemMap.values().next().value.tasks];
    }
  }
}
