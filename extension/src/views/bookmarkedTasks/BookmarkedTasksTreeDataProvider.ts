import * as vscode from 'vscode';
import {
  BookmarkedTasksWorkspaceTreeItem,
  BookmarkedTaskTreeItem,
  NoBookmarkedTasksTreeItem,
} from '.';
import { JavaDebug, getConfigJavaDebug } from '../../config';
import { GradleTaskTreeItem } from '..';
import { GradleTaskDefinition } from '../../tasks';
import { isWorkspaceFolder } from '../../util';
import { BookmarkedTasksStore } from '../../stores';
import { Extension } from '../../extension';
import { TaskId, TaskArgs } from '../../stores/types';
import { cloneTask } from '../../tasks/taskUtil';

const bookmarkedTasksWorkspaceTreeItemMap: Map<
  string,
  BookmarkedTasksWorkspaceTreeItem
> = new Map();
export const bookmarkedTasksWorkspaceJavaDebugMap: Map<
  string,
  JavaDebug
> = new Map();

// eslint-disable-next-line sonarjs/no-unused-collection
export const bookmarkedTasksTreeItemMap: Map<
  string,
  BookmarkedTaskTreeItem
> = new Map();

function buildTaskTreeItem(
  workspaceTreeItem: BookmarkedTasksWorkspaceTreeItem,
  task: vscode.Task
): GradleTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  const workspaceFolder = task.scope as vscode.WorkspaceFolder;
  const bookmarkedTaskTreeItem = new BookmarkedTaskTreeItem(
    workspaceTreeItem,
    task,
    task.name,
    definition.description || task.name,
    '',
    bookmarkedTasksWorkspaceJavaDebugMap.get(workspaceFolder.name)
  );
  bookmarkedTaskTreeItem.setContext();
  return bookmarkedTaskTreeItem;
}

function buildWorkspaceTreeItem(task: vscode.Task): void {
  const definition = task.definition as GradleTaskDefinition;
  if (isWorkspaceFolder(task.scope) && definition.buildFile) {
    let workspaceTreeItem = bookmarkedTasksWorkspaceTreeItemMap.get(
      task.scope.name
    );
    if (!workspaceTreeItem) {
      workspaceTreeItem = new BookmarkedTasksWorkspaceTreeItem(task.scope.name);
      bookmarkedTasksWorkspaceTreeItemMap.set(
        task.scope.name,
        workspaceTreeItem
      );
    }

    if (!bookmarkedTasksWorkspaceJavaDebugMap.has(task.scope.name)) {
      bookmarkedTasksWorkspaceJavaDebugMap.set(
        task.scope.name,
        getConfigJavaDebug(task.scope)
      );
    }

    const bookmarkedTaskTreeItem = buildTaskTreeItem(workspaceTreeItem, task);
    bookmarkedTasksTreeItemMap.set(
      definition.id + definition.args,
      bookmarkedTaskTreeItem
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
    private readonly bookmarkedTasksStore: BookmarkedTasksStore
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
    if (element instanceof BookmarkedTasksWorkspaceTreeItem) {
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
    bookmarkedTasksTreeItemMap.clear();
    bookmarkedTasksWorkspaceTreeItemMap.clear();

    const { workspaceFolders } = vscode.workspace;
    if (!workspaceFolders) {
      return [];
    }
    const isMultiRoot = workspaceFolders.length > 1;

    const gradleTaskProvider = Extension.getInstance().getGradleTaskProvider();
    await gradleTaskProvider.waitForTasksLoad();

    const bookmarkedTasks = this.bookmarkedTasksStore.getData();
    Array.from(bookmarkedTasks.keys()).forEach((taskId: TaskId) => {
      const task = gradleTaskProvider.findByTaskId(taskId);
      if (!task) {
        return;
      }
      const taskArgs = bookmarkedTasks.get(taskId) || '';
      if (taskArgs) {
        Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
          const bookmarkedTask = cloneTask(task, args);
          buildWorkspaceTreeItem(bookmarkedTask);
        });
      }
    });

    if (!bookmarkedTasksWorkspaceTreeItemMap.size) {
      return [];
    } else if (isMultiRoot) {
      return [...bookmarkedTasksWorkspaceTreeItemMap.values()];
    } else {
      return [
        ...bookmarkedTasksWorkspaceTreeItemMap.values().next().value.tasks,
      ];
    }
  }
}
