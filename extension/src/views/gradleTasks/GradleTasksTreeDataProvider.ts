import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceTreeItem } from './WorkspaceTreeItem';
import { GradleTaskTreeItem } from './GradleTaskTreeItem';
import { ProjectTreeItem } from './ProjectTreeItem';
import { TreeItemWithTasksOrGroups } from './TreeItemWithTasksOrGroups';
import { GroupTreeItem } from './GroupTreeItem';
import { JavaDebug, getConfigJavaDebug } from '../../config';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';
import { isWorkspaceFolder } from '../../util';
import { NoGradleTasksTreeItem } from './NoGradleTasksTreeItem';
import { EventWaiter } from '../../events/EventWaiter';
import { Extension } from '../../extension/Extension';

// eslint-disable-next-line sonarjs/no-unused-collection
export const gradleTaskTreeItemMap: Map<string, GradleTaskTreeItem> = new Map();
export const workspaceTreeItemMap: Map<string, WorkspaceTreeItem> = new Map();
export const projectTreeItemMap: Map<string, ProjectTreeItem> = new Map();
export const groupTreeItemMap: Map<string, GroupTreeItem> = new Map();
export const workspaceJavaDebugMap: Map<string, JavaDebug> = new Map();

function resetCachedTreeItems(): void {
  gradleTaskTreeItemMap.clear();
  workspaceTreeItemMap.clear();
  projectTreeItemMap.clear();
  groupTreeItemMap.clear();
  workspaceJavaDebugMap.clear();
}

export class GradleTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private collapsed = true;

  private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  private readonly _onDidBuildTreeItems: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  public readonly onDidBuildTreeItems: vscode.Event<null> = this
    ._onDidBuildTreeItems.event;

  public readonly waitForBuildTreeItems = new EventWaiter(
    this.onDidBuildTreeItems
  ).wait;

  constructor(private readonly context: vscode.ExtensionContext) {
    const collapsed = this.context.workspaceState.get(
      'gradleTasksCollapsed',
      false
    );
    this.setCollapsed(collapsed);
  }

  public setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.context.workspaceState.update('gradleTasksCollapsed', collapsed);
    vscode.commands.executeCommand(
      'setContext',
      'gradle:gradleTasksCollapsed',
      collapsed
    );
    this.refresh();
  }

  private async buildTreeItems(): Promise<vscode.TreeItem[]> {
    resetCachedTreeItems();
    // using vscode.tasks.fetchTasks({ type: 'gradle' }) is *incredibly slow* which
    // is why we get them directly from the task provider
    const tasks = await Extension.getInstance().gradleTaskProvider.loadTasks();
    const taskItems =
      tasks.length === 0
        ? [new NoGradleTasksTreeItem(this.context)]
        : this.buildItemsTreeFromTasks(tasks);
    this._onDidBuildTreeItems.fire(null);
    return taskItems;
  }

  public refresh(treeItem: vscode.TreeItem | null = null): void {
    this._onDidChangeTreeData.fire(treeItem);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getParent(element: vscode.TreeItem): vscode.TreeItem | null {
    if (
      element instanceof WorkspaceTreeItem ||
      element instanceof ProjectTreeItem ||
      element instanceof TreeItemWithTasksOrGroups ||
      element instanceof GradleTaskTreeItem
    ) {
      return element.parentTreeItem || null;
    }
    return null;
  }

  public async getChildren(
    element?: vscode.TreeItem
  ): Promise<vscode.TreeItem[]> {
    if (element instanceof WorkspaceTreeItem) {
      return [...element.projectFolders, ...element.projects];
    }
    if (element instanceof ProjectTreeItem) {
      return [...element.groups, ...element.tasks];
    }
    if (element instanceof GroupTreeItem) {
      return element.tasks;
    }
    if (
      element instanceof GradleTaskTreeItem ||
      element instanceof NoGradleTasksTreeItem
    ) {
      return [];
    }
    if (!element) {
      return await this.buildTreeItems();
    }
    return [];
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  public buildItemsTreeFromTasks(
    tasks: vscode.Task[]
  ): WorkspaceTreeItem[] | NoGradleTasksTreeItem[] {
    let workspaceTreeItem = null;

    tasks.forEach((task) => {
      const definition = task.definition as GradleTaskDefinition;
      if (isWorkspaceFolder(task.scope) && definition.buildFile) {
        workspaceTreeItem = workspaceTreeItemMap.get(task.scope.name);
        if (!workspaceTreeItem) {
          workspaceTreeItem = new WorkspaceTreeItem(
            task.scope.name,
            task.scope.uri
          );
          workspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
        }

        if (!workspaceJavaDebugMap.has(task.scope.name)) {
          workspaceJavaDebugMap.set(
            task.scope.name,
            getConfigJavaDebug(task.scope)
          );
        }

        const projectName = this.collapsed
          ? definition.rootProject
          : definition.project;
        let projectTreeItem = projectTreeItemMap.get(definition.buildFile);
        if (!projectTreeItem) {
          projectTreeItem = new ProjectTreeItem(
            projectName,
            workspaceTreeItem,
            vscode.Uri.file(definition.buildFile)
          );
          workspaceTreeItem.addProject(projectTreeItem);
          projectTreeItemMap.set(definition.buildFile, projectTreeItem);
        }

        const taskName = definition.script.slice(
          definition.script.lastIndexOf(':') + 1
        );
        let parentTreeItem: ProjectTreeItem | GroupTreeItem = projectTreeItem;

        if (!this.collapsed) {
          const groupId = definition.group + definition.project;
          let groupTreeItem = groupTreeItemMap.get(groupId);
          if (!groupTreeItem) {
            groupTreeItem = new GroupTreeItem(
              definition.group,
              workspaceTreeItem,
              undefined
            );
            projectTreeItem.addGroup(groupTreeItem);
            groupTreeItemMap.set(groupId, groupTreeItem);
          }
          parentTreeItem = groupTreeItem;
        }

        const taskTreeItem = new GradleTaskTreeItem(
          parentTreeItem,
          task,
          taskName,
          definition.description,
          workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder))
        );
        taskTreeItem.setContext();

        gradleTaskTreeItemMap.set(task.definition.id, taskTreeItem);
        parentTreeItem.addTask(taskTreeItem);
      }
    });

    if (workspaceTreeItemMap.size === 1) {
      return [
        ...workspaceTreeItemMap.values().next().value.projectFolders,
        ...workspaceTreeItemMap.values().next().value.projects,
      ];
    }
    return [...workspaceTreeItemMap.values()];
  }
}
