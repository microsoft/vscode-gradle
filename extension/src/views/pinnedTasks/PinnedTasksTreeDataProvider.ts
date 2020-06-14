import * as vscode from 'vscode';
import * as path from 'path';
import {
  PinnedTasksRootProjectTreeItem,
  PinnedTaskTreeItem,
  NoPinnedTasksTreeItem,
} from '.';
import { GradleTaskTreeItem, gradleProjectJavaDebugMap } from '..';
import { GradleTaskDefinition } from '../../tasks';
import { isWorkspaceFolder } from '../../util';
import { PinnedTasksStore, RootProjectsStore } from '../../stores';
import { Extension } from '../../extension';
import { TaskId, TaskArgs } from '../../stores/types';
import { cloneTask, isGradleTask } from '../../tasks/taskUtil';

const pinnedTasksGradleProjectTreeItemMap: Map<
  string,
  PinnedTasksRootProjectTreeItem
> = new Map();

// eslint-disable-next-line sonarjs/no-unused-collection
export const pinnedTasksTreeItemMap: Map<
  string,
  PinnedTaskTreeItem
> = new Map();

function buildTaskTreeItem(
  gradleProjectTreeItem: PinnedTasksRootProjectTreeItem,
  task: vscode.Task
): GradleTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  const pinnedTaskTreeItem = new PinnedTaskTreeItem(
    gradleProjectTreeItem,
    task,
    task.name,
    definition.description || task.name,
    '',
    gradleProjectJavaDebugMap.get(definition.projectFolder)
  );
  pinnedTaskTreeItem.setContext();
  return pinnedTaskTreeItem;
}

function buildGradleProjectTreeItem(task: vscode.Task): void {
  const definition = task.definition as GradleTaskDefinition;
  if (isWorkspaceFolder(task.scope) && isGradleTask(task)) {
    let gradleProjectTreeItem = pinnedTasksGradleProjectTreeItemMap.get(
      definition.projectFolder
    );
    if (!gradleProjectTreeItem) {
      gradleProjectTreeItem = new PinnedTasksRootProjectTreeItem(
        path.basename(definition.projectFolder)
      );
      pinnedTasksGradleProjectTreeItemMap.set(
        definition.projectFolder,
        gradleProjectTreeItem
      );
    }

    const pinnedTaskTreeItem = buildTaskTreeItem(gradleProjectTreeItem, task);
    pinnedTasksTreeItemMap.set(
      definition.id + definition.args,
      pinnedTaskTreeItem
    );

    gradleProjectTreeItem.addTask(pinnedTaskTreeItem);
  }
}

export class PinnedTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly pinnedTasksStore: PinnedTasksStore,
    private readonly rootProjectsStore: RootProjectsStore
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
    if (element instanceof PinnedTasksRootProjectTreeItem) {
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
    pinnedTasksGradleProjectTreeItemMap.clear();

    const rootProjects = await this.rootProjectsStore.buildAndGetProjectRoots();
    if (!rootProjects.length) {
      return [];
    }
    const isMultiRoot = rootProjects.length > 1;

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
          buildGradleProjectTreeItem(pinnedTask);
        });
      }
    });

    if (!pinnedTasksGradleProjectTreeItemMap.size) {
      return [];
    } else if (isMultiRoot) {
      return [...pinnedTasksGradleProjectTreeItemMap.values()];
    } else {
      return [
        ...pinnedTasksGradleProjectTreeItemMap.values().next().value.tasks,
      ];
    }
  }
}
