import * as vscode from 'vscode';
import * as path from 'path';
import { workspaceJavaDebugMap } from '../gradleTasks/GradleTasksTreeDataProvider';
import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { isWorkspaceFolder } from '../../util';
import { TaskHistoryWorkspaceTreeItem } from './TaskHistoryWorkspaceTreeItem';
import { RecentTasksStore } from '../../stores/RecentTasksStore';
import { NoRecentTasksTreeItem } from './NoRecentTasksTreeItem';
import { cloneTask } from '../../tasks/taskUtil';
import { Extension } from '../../extension/Extension';
import { RecentTasksWorkspaceTreeItem } from './RecentTasksWorkspaceTreeItem';
import { TaskId, TaskArgs } from '../../stores/types';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';
import { RecentTaskTreeItem } from './RecentTaskTreeItem';
import {
  TaskTerminalsStore,
  TaskWithTerminal,
} from '../../stores/TaskTerminalsStore';

const recentTasksWorkspaceTreeItemMap: Map<
  string,
  RecentTasksWorkspaceTreeItem
> = new Map();

// eslint-disable-next-line sonarjs/no-unused-collection
export const recentTasksTreeItemMap: Map<
  string,
  RecentTaskTreeItem
> = new Map();

function buildTaskTreeItem(
  workspaceTreeItem: RecentTasksWorkspaceTreeItem,
  task: vscode.Task,
  taskTerminalsStore: TaskTerminalsStore
): RecentTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  const recentTaskTreeItem = new RecentTaskTreeItem(
    workspaceTreeItem,
    task,
    '',
    definition.description,
    workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder)),
    taskTerminalsStore
  );
  recentTaskTreeItem.setContext();
  return recentTaskTreeItem;
}

function buildWorkspaceTreeItem(
  task: vscode.Task,
  taskTerminalsStore: TaskTerminalsStore
): void {
  const definition = task.definition as GradleTaskDefinition;
  if (isWorkspaceFolder(task.scope) && definition.buildFile) {
    let workspaceTreeItem = recentTasksWorkspaceTreeItemMap.get(
      task.scope.name
    );
    if (!workspaceTreeItem) {
      workspaceTreeItem = new RecentTasksWorkspaceTreeItem(task.scope.name);
      recentTasksWorkspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
    }

    const recentTaskTreeItem = buildTaskTreeItem(
      workspaceTreeItem,
      task,
      taskTerminalsStore
    );
    recentTasksTreeItemMap.set(
      definition.id + definition.args,
      recentTaskTreeItem
    );

    workspaceTreeItem.addTask(recentTaskTreeItem);
  }
}

export class RecentTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly recentTasksStore: RecentTasksStore,
    private readonly taskTerminalsStore: TaskTerminalsStore
  ) {
    this.recentTasksStore.onDidChange(() => this.refresh());
    this.taskTerminalsStore.onDidChange(this.handleTerminalsStoreChange);
  }

  private handleTerminalsStoreChange = (
    terminals: Set<TaskWithTerminal> | null
  ): void => {
    if (terminals) {
      const taskId = Array.from(this.taskTerminalsStore.getData().keys()).find(
        (key) => this.taskTerminalsStore.getItem(key) === terminals
      );
      if (taskId) {
        const treeItem = recentTasksTreeItemMap.get(taskId);
        if (treeItem) {
          treeItem.setContext();
          this.refresh(treeItem);
          return;
        }
      }
    }
    this.refresh();
  };

  public getStore(): RecentTasksStore {
    return this.recentTasksStore;
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
    if (element instanceof TaskHistoryWorkspaceTreeItem) {
      return [...element.tasks];
    }
    if (!element) {
      const treeItems = await this.buildTreeItems();
      if (!treeItems.length) {
        return [new NoRecentTasksTreeItem(this.context)];
      } else {
        return treeItems;
      }
    }
    return [];
  }

  private async buildTreeItems(): Promise<vscode.TreeItem[]> {
    recentTasksWorkspaceTreeItemMap.clear();
    recentTasksTreeItemMap.clear();

    const { workspaceFolders } = vscode.workspace;
    if (!workspaceFolders) {
      return [];
    }
    const isMultiRoot = workspaceFolders.length > 1;
    const { gradleTaskProvider } = Extension.getInstance();
    await gradleTaskProvider.waitForTasksLoad();

    const recentTasks = this.recentTasksStore.getData();
    Array.from(recentTasks.keys()).forEach((taskId: TaskId) => {
      const task = gradleTaskProvider.findByTaskId(taskId);
      if (!task) {
        return;
      }
      const definition = task.definition as GradleTaskDefinition;
      const taskArgs = recentTasks.get(taskId) || '';

      if (taskArgs) {
        Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
          const recentTask = cloneTask(task, args, definition.javaDebug);
          buildWorkspaceTreeItem(recentTask, this.taskTerminalsStore);
        });
      }
    });

    if (!recentTasksWorkspaceTreeItemMap.size) {
      return [];
    } else if (isMultiRoot) {
      return [...recentTasksWorkspaceTreeItemMap.values()];
    } else {
      return [...recentTasksWorkspaceTreeItemMap.values().next().value.tasks];
    }
  }
}
