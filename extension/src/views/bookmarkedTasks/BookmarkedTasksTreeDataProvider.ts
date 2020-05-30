import * as vscode from 'vscode';
import * as path from 'path';
import { workspaceJavaDebugMap } from '../gradleTasks/GradleTasksTreeDataProvider';
import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { BookmarkedTasksStore } from '../../stores/BookmarkedTasksStore';
import { isWorkspaceFolder } from '../../util';
import { NoBookmarkedTasksTreeItem } from './NoBookmarkedTasksTreeItem';
import { TaskId, TaskArgs } from '../../stores/types';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';
import { cloneTask } from '../../tasks/taskUtil';
import { BookmarkedTaskTreeItem } from './BookmarkedTaskTreeItem';
import { Extension } from '../../extension/Extension';
import { BookmarkedTasksWorkspaceTreeItem } from './BookmarkedTasksWorkspaceTreeItem';

function buildTaskTreeItem(
  workspaceTreeItem: BookmarkedTasksWorkspaceTreeItem,
  task: vscode.Task
): GradleTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  const bookmarkedTaskTreeItem = new BookmarkedTaskTreeItem(
    workspaceTreeItem,
    task,
    task.name,
    definition.description,
    workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder))
  );
  bookmarkedTaskTreeItem.setContext();
  return bookmarkedTaskTreeItem;
}

function buildWorkspaceTreeItem(
  workspaceTreeItemMap: Map<string, BookmarkedTasksWorkspaceTreeItem>,
  task: vscode.Task
): void {
  if (isWorkspaceFolder(task.scope) && task.definition.buildFile) {
    let workspaceTreeItem = workspaceTreeItemMap.get(task.scope.name);
    if (!workspaceTreeItem) {
      workspaceTreeItem = new BookmarkedTasksWorkspaceTreeItem(task.scope.name);
      workspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
    }

    const bookmarkedTaskTreeItem = buildTaskTreeItem(workspaceTreeItem, task);

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
    const { workspaceFolders } = vscode.workspace;
    if (!workspaceFolders) {
      return [];
    }
    const isMultiRoot = workspaceFolders.length > 1;
    const workspaceTreeItemMap: Map<
      string,
      BookmarkedTasksWorkspaceTreeItem
    > = new Map();

    const { gradleTaskProvider } = Extension.getInstance();
    await gradleTaskProvider.waitForTasksLoad();

    const bookmarkedTasks = this.bookmarkedTasksStore.getData();
    Array.from(bookmarkedTasks.keys()).forEach((taskId: TaskId) => {
      const task = gradleTaskProvider.findByTaskId(taskId);
      if (!task) {
        return;
      }
      const definition = task.definition as GradleTaskDefinition;
      const taskArgs = bookmarkedTasks.get(taskId) || '';
      if (taskArgs) {
        Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
          const bookmarkedTask = cloneTask(task, args, definition.javaDebug);
          buildWorkspaceTreeItem(workspaceTreeItemMap, bookmarkedTask);
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
