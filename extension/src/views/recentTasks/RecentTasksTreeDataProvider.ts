import * as vscode from 'vscode';
import * as path from 'path';
import {
  RecentTaskTreeItem,
  NoRecentTasksTreeItem,
  RecentTasksRootProjectTreeItem,
} from '.';
import {
  TaskTerminalsStore,
  RecentTasksStore,
  RootProjectsStore,
} from '../../stores';
import { GradleTaskDefinition } from '../../tasks';
import { gradleProjectJavaDebugMap, GradleTaskTreeItem } from '..';
import { isWorkspaceFolder } from '../../util';
import { Extension } from '../../extension';
import { TaskId, TaskArgs } from '../../stores/types';
import { cloneTask, isGradleTask } from '../../tasks/taskUtil';

const recentTasksGradleProjectTreeItemMap: Map<
  string,
  RecentTasksRootProjectTreeItem
> = new Map();

// eslint-disable-next-line sonarjs/no-unused-collection
export const recentTasksTreeItemMap: Map<
  string,
  RecentTaskTreeItem
> = new Map();

function buildTaskTreeItem(
  gradleProjectTreeItem: RecentTasksRootProjectTreeItem,
  task: vscode.Task,
  taskTerminalsStore: TaskTerminalsStore
): RecentTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  const recentTaskTreeItem = new RecentTaskTreeItem(
    gradleProjectTreeItem,
    task,
    task.name,
    definition.description,
    gradleProjectJavaDebugMap.get(definition.projectFolder),
    taskTerminalsStore
  );
  recentTaskTreeItem.setContext();
  return recentTaskTreeItem;
}

function buildGradleProjectTreeItem(
  task: vscode.Task,
  taskTerminalsStore: TaskTerminalsStore
): void {
  const definition = task.definition as GradleTaskDefinition;
  if (isWorkspaceFolder(task.scope) && isGradleTask(task)) {
    let gradleProjectTreeItem = recentTasksGradleProjectTreeItemMap.get(
      definition.projectFolder
    );
    if (!gradleProjectTreeItem) {
      gradleProjectTreeItem = new RecentTasksRootProjectTreeItem(
        path.basename(definition.projectFolder)
      );
      recentTasksGradleProjectTreeItemMap.set(
        definition.projectFolder,
        gradleProjectTreeItem
      );
    }

    const recentTaskTreeItem = buildTaskTreeItem(
      gradleProjectTreeItem,
      task,
      taskTerminalsStore
    );
    recentTasksTreeItemMap.set(
      definition.id + definition.args,
      recentTaskTreeItem
    );

    gradleProjectTreeItem.addTask(recentTaskTreeItem);
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
    private readonly taskTerminalsStore: TaskTerminalsStore,
    private readonly rootProjectsStore: RootProjectsStore
  ) {
    this.recentTasksStore.onDidChange(() => this.refresh());
    this.taskTerminalsStore.onDidChange(this.handleTerminalsStoreChange);
  }

  private handleTerminalsStoreChange = (
    terminals: Set<vscode.Terminal> | null
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
    if (element instanceof RecentTasksRootProjectTreeItem) {
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
    recentTasksGradleProjectTreeItemMap.clear();
    recentTasksTreeItemMap.clear();

    const gradleProjects = await this.rootProjectsStore.buildAndGetProjectRoots();
    if (!gradleProjects.length) {
      return [];
    }
    const isMultiRoot = gradleProjects.length > 1;
    const gradleTaskProvider = Extension.getInstance().getGradleTaskProvider();
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
          buildGradleProjectTreeItem(recentTask, this.taskTerminalsStore);
        });
      }
    });

    if (!recentTasksGradleProjectTreeItemMap.size) {
      return [];
    } else if (isMultiRoot) {
      return [...recentTasksGradleProjectTreeItemMap.values()];
    } else {
      return [
        ...recentTasksGradleProjectTreeItemMap.values().next().value.tasks,
      ];
    }
  }
}
