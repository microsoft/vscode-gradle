import * as vscode from 'vscode';
import * as path from 'path';
import {
  PinnedTasksRootProjectTreeItem,
  PinnedTaskTreeItem,
  NoPinnedTasksTreeItem,
} from '.';
import { GradleTaskTreeItem } from '..';
import { GradleTaskDefinition } from '../../tasks';
import { isWorkspaceFolder } from '../../util';
import { PinnedTasksStore, RootProjectsStore } from '../../stores';
import { Extension } from '../../extension';
import { TaskId, TaskArgs } from '../../stores/types';
import { cloneTask, isGradleTask, buildTaskName } from '../../tasks/taskUtil';
import { RootProject } from '../../rootProject/RootProject';

const pinnedTasksGradleProjectTreeItemMap: Map<
  string,
  PinnedTasksRootProjectTreeItem
> = new Map();

const pinnedTasksTreeItemMap: Map<string, PinnedTaskTreeItem> = new Map();

export function getPinnedTasksTreeItemMap(): Map<string, PinnedTaskTreeItem> {
  return pinnedTasksTreeItemMap;
}

function buildTaskTreeItem(
  gradleProjectTreeItem: PinnedTasksRootProjectTreeItem,
  task: vscode.Task,
  rootProject: RootProject
): GradleTaskTreeItem {
  const definition = task.definition as GradleTaskDefinition;
  const taskName = buildTaskName(definition);
  const pinnedTaskTreeItem = new PinnedTaskTreeItem(
    gradleProjectTreeItem,
    task,
    taskName,
    definition.description || taskName, // tooltip
    '', // description
    // TODO: debug map won't exist unless the main gradle tasks view is visible
    rootProject.getJavaDebug()
  );
  pinnedTaskTreeItem.setContext();
  return pinnedTaskTreeItem;
}

function buildGradleProjectTreeItem(
  task: vscode.Task,
  rootProject: RootProject
): void {
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

    const pinnedTaskTreeItem = buildTaskTreeItem(
      gradleProjectTreeItem,
      task,
      rootProject
    );
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
      const definition = task.definition as GradleTaskDefinition;
      const rootProject = this.rootProjectsStore.get(definition.projectFolder);
      if (!rootProject) {
        return;
      }
      const taskArgs = pinnedTasks.get(taskId) || '';
      if (taskArgs) {
        Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
          const pinnedTask = cloneTask(task, args);
          buildGradleProjectTreeItem(pinnedTask, rootProject);
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
