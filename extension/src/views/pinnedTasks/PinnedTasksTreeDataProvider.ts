import * as vscode from 'vscode';
import {
  PinnedTasksWorkspaceTreeItem,
  PinnedTaskTreeItem,
  NoPinnedTasksTreeItem,
} from '.';
import { JavaDebug, getConfigJavaDebug } from '../../config';
import { GradleTaskTreeItem } from '..';
import { GradleTaskDefinition } from '../../tasks';
import { isWorkspaceFolder } from '../../util';
import { PinnedTasksStore } from '../../stores';
import { Extension } from '../../extension';
import { TaskId, TaskArgs } from '../../stores/types';
import { cloneTask } from '../../tasks/taskUtil';

const pinnedTasksWorkspaceTreeItemMap: Map<
  string,
  PinnedTasksWorkspaceTreeItem
> = new Map();
export const pinnedTasksWorkspaceJavaDebugMap: Map<
  string,
  JavaDebug
> = new Map();

// eslint-disable-next-line sonarjs/no-unused-collection
export const pinnedTasksTreeItemMap: Map<
  string,
  PinnedTaskTreeItem
> = new Map();

function buildTaskTreeItem(
  workspaceTreeItem: PinnedTasksWorkspaceTreeItem,
  task: vscode.Task
): GradleTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  const workspaceFolder = task.scope as vscode.WorkspaceFolder;
  const pinnedTaskTreeItem = new PinnedTaskTreeItem(
    workspaceTreeItem,
    task,
    task.name,
    definition.description || task.name,
    '',
    pinnedTasksWorkspaceJavaDebugMap.get(workspaceFolder.name)
  );
  pinnedTaskTreeItem.setContext();
  return pinnedTaskTreeItem;
}

function buildWorkspaceTreeItem(task: vscode.Task): void {
  const definition = task.definition as GradleTaskDefinition;
  if (isWorkspaceFolder(task.scope) && definition.buildFile) {
    let workspaceTreeItem = pinnedTasksWorkspaceTreeItemMap.get(
      task.scope.name
    );
    if (!workspaceTreeItem) {
      workspaceTreeItem = new PinnedTasksWorkspaceTreeItem(task.scope.name);
      pinnedTasksWorkspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
    }

    if (!pinnedTasksWorkspaceJavaDebugMap.has(task.scope.name)) {
      pinnedTasksWorkspaceJavaDebugMap.set(
        task.scope.name,
        getConfigJavaDebug(task.scope)
      );
    }

    const pinnedTaskTreeItem = buildTaskTreeItem(workspaceTreeItem, task);
    pinnedTasksTreeItemMap.set(
      definition.id + definition.args,
      pinnedTaskTreeItem
    );

    workspaceTreeItem.addTask(pinnedTaskTreeItem);
  }
}

export class PinnedTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly pinnedTasksStore: PinnedTasksStore
  ) {
    this.pinnedTasksStore.onDidChange(() => this.refresh());
  }

  public getStore(): PinnedTasksStore {
    return this.pinnedTasksStore;
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
    if (element instanceof PinnedTasksWorkspaceTreeItem) {
      return [...element.tasks];
    }
    if (!element) {
      const treeItems = await this.buildTreeItems();
      if (!treeItems.length) {
        return [new NoPinnedTasksTreeItem(this.context)];
      } else {
        return treeItems;
      }
    }
    return [];
  }

  private async buildTreeItems(): Promise<vscode.TreeItem[]> {
    pinnedTasksTreeItemMap.clear();
    pinnedTasksWorkspaceTreeItemMap.clear();

    const { workspaceFolders } = vscode.workspace;
    if (!workspaceFolders) {
      return [];
    }
    const isMultiRoot = workspaceFolders.length > 1;

    const gradleTaskProvider = Extension.getInstance().getGradleTaskProvider();
    await gradleTaskProvider.waitForTasksLoad();

    const pinnedTasks = this.pinnedTasksStore.getData();
    Array.from(pinnedTasks.keys()).forEach((taskId: TaskId) => {
      const task = gradleTaskProvider.findByTaskId(taskId);
      if (!task) {
        return;
      }
      const taskArgs = pinnedTasks.get(taskId) || '';
      if (taskArgs) {
        Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
          const pinnedTask = cloneTask(task, args);
          buildWorkspaceTreeItem(pinnedTask);
        });
      }
    });

    if (!pinnedTasksWorkspaceTreeItemMap.size) {
      return [];
    } else if (isMultiRoot) {
      return [...pinnedTasksWorkspaceTreeItemMap.values()];
    } else {
      return [...pinnedTasksWorkspaceTreeItemMap.values().next().value.tasks];
    }
  }
}
