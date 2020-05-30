import * as vscode from 'vscode';
import * as path from 'path';
import { workspaceJavaDebugMap } from '../gradleTasks/GradleTasksTreeDataProvider';
import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { isWorkspaceFolder } from '../../util';
import { TaskHistoryWorkspaceTreeItem } from './TaskHistoryWorkspaceTreeItem';
import { RecentTasksStore } from '../../stores/RecentTasksStore';
import { NoRecentTasksTreeItem } from './NoRecentTasksTreeItem';
import { cloneTask, buildTaskName } from '../../tasks/taskUtil';
import { Extension } from '../../extension/Extension';
import { RecentTasksWorkspaceTreeItem } from './RecentTasksWorkspaceTreeItem';
import { TaskId, TaskArgs } from '../../stores/types';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';
import { RecentTaskTreeItem } from './RecentTaskTreeItem';
import { TaskTerminalsStore } from '../../stores/TaskTerminalsStore';

function buildTaskTreeItem(
  workspaceTreeItem: RecentTasksWorkspaceTreeItem,
  task: vscode.Task,
  taskLabel: string,
  numTerminals: number
): GradleTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  const recentTaskTreeItem = new RecentTaskTreeItem(
    workspaceTreeItem,
    task,
    taskLabel,
    definition.description,
    workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder)),
    numTerminals
  );
  recentTaskTreeItem.setContext();
  return recentTaskTreeItem;
}

function buildWorkspaceTreeItem(
  workspaceTreeItemMap: Map<string, RecentTasksWorkspaceTreeItem>,
  task: vscode.Task,
  taskLabel: string,
  numTerminals: number
): void {
  if (isWorkspaceFolder(task.scope) && task.definition.buildFile) {
    let workspaceTreeItem = workspaceTreeItemMap.get(task.scope.name);
    if (!workspaceTreeItem) {
      workspaceTreeItem = new RecentTasksWorkspaceTreeItem(task.scope.name);
      workspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
    }

    const bookmarkedTaskTreeItem = buildTaskTreeItem(
      workspaceTreeItem,
      task,
      taskLabel,
      numTerminals
    );

    workspaceTreeItem.addTask(bookmarkedTaskTreeItem);
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
    // this.recentTasksStore.onDidChange(() => this.refresh());
    this.taskTerminalsStore.onDidChange(() => this.refresh());
  }

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
    const { workspaceFolders } = vscode.workspace;
    if (!workspaceFolders) {
      return [];
    }
    const isMultiRoot = workspaceFolders.length > 1;
    const workspaceTreeItemMap: Map<
      string,
      RecentTasksWorkspaceTreeItem
    > = new Map();

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
      const taskTerminalsSet = this.taskTerminalsStore.getItem(definition.id);
      if (!taskTerminalsSet) {
        return;
      }
      const taskTerminals = Array.from(taskTerminalsSet);
      if (taskArgs) {
        Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
          const recentTask = cloneTask(task, args, definition.javaDebug);
          const numTerminals = taskTerminals.filter((terminal) => {
            return terminal.args === args;
          }).length;
          const taskName = `${buildTaskName(
            recentTask.definition as GradleTaskDefinition
          )} (${numTerminals})`;
          buildWorkspaceTreeItem(
            workspaceTreeItemMap,
            recentTask,
            taskName,
            numTerminals
          );
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

  // // eslint-disable-next-line sonarjs/cognitive-complexity
  // private async buildTreeItems2(): Promise<vscode.TreeItem[]> {
  //   const { workspaceFolders } = vscode.workspace;
  //   if (!workspaceFolders) {
  //     return [];
  //   }
  //   const recentTasks = this.recentTasksStore.get();

  //   const isMultiRoot = workspaceFolders.length > 1;
  //   const workspaceTreeItemMap: Map<
  //     string,
  //     TaskHistoryWorkspaceTreeItem
  //   > = new Map();

  //   // For performance reasons, we find the associated task via the taskTreeItemMap,
  //   // so we need to wait for the treeItems to be built first
  //   // TODO: make this a decorator
  //   await this.gradleTasksTreeDataProvider.waitForBuildTreeItems();

  //   if (taskTreeItemMap.size === 0) {
  //     return [];
  //   }

  //   recentTasks.forEach((definition) => {
  //     const treeItem = taskTreeItemMap.get(definition.id);
  //     if (!treeItem) {
  //       return;
  //     }
  //     const { task } = treeItem;
  //     if (isWorkspaceFolder(task.scope) && task.definition.buildFile) {
  //       let workspaceTreeItem = workspaceTreeItemMap.get(task.scope.name);
  //       if (!workspaceTreeItem) {
  //         workspaceTreeItem = new TaskHistoryWorkspaceTreeItem(task.scope.name);
  //         workspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
  //       }

  //       const tasksWithTerminals: TaskWithTerminal[] = this.taskTerminalsStore.getList(
  //         definition.id
  //       );

  //       const taskWithTerminalsGroupedbyArgs = tasksWithTerminals.reduce(
  //         (previousValue: TaskByArgsGroup, currentValue: TaskWithTerminal) => {
  //           const key = currentValue.definition.args || '';
  //           if (!previousValue[key]) {
  //             previousValue[key] = [];
  //           }
  //           previousValue[key].push(currentValue.terminal);
  //           return previousValue;
  //         },
  //         {}
  //       );
  //       Object.keys(taskWithTerminalsGroupedbyArgs).forEach((argKey) => {
  //         const terminals = taskWithTerminalsGroupedbyArgs[argKey];
  //         const argLabel = argKey ? ` ${argKey} ` : ' ';
  //         const label = `${task.name}${argLabel}(${terminals.length})`;
  //         const recentTaskTreeItem = new GradleTaskTreeItem(
  //           workspaceTreeItem!,
  //           cloneTask(
  //             task,
  //             definition.args,
  //             this.client,
  //             this.taskTerminalsStore,
  //             definition.javaDebug
  //           ),
  //           label,
  //           definition.description,
  //           this.iconPathRunning!,
  //           this.iconPathIdle!,
  //           workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder))
  //         );
  //         workspaceTreeItem!.addTask(recentTaskTreeItem);
  //       });
  //     }
  //   });

  //   if (!workspaceTreeItemMap.size) {
  //     return [];
  //   } else if (isMultiRoot) {
  //     return [...workspaceTreeItemMap.values()];
  //   } else {
  //     return [...workspaceTreeItemMap.values().next().value.tasks];
  //   }
  // }
}
