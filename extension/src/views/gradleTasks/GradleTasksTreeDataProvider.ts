import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceTreeItem } from './WorkspaceTreeItem';
import { NoTasksTreeItem } from './NoTasksTreeItem';
import { IconPath } from '../types';
import { GradleTaskTreeItem } from './GradleTaskTreeItem';
import { ProjectTreeItem } from './ProjectTreeItem';
import { TreeItemWithTasksOrGroups } from './TreeItemWithTasksOrGroups';
import { GroupTreeItem } from './GroupTreeItem';
import { JavaDebug, getConfigJavaDebug } from '../../config';
import { GradleTaskDefinition } from '../../tasks/GradleTaskDefinition';
import { ICON_LOADING, ICON_GRADLE_TASK } from '../constants';
import { isWorkspaceFolder } from '../../util';
import { GradleTaskProvider } from '../../tasks/GradleTaskProvider';

// eslint-disable-next-line sonarjs/no-unused-collection
export const taskTreeItemMap: Map<string, GradleTaskTreeItem> = new Map();
export const workspaceTreeItemMap: Map<string, WorkspaceTreeItem> = new Map();
export const projectTreeItemMap: Map<string, ProjectTreeItem> = new Map();
export const groupTreeItemMap: Map<string, GroupTreeItem> = new Map();
export const workspaceJavaDebugMap: Map<string, JavaDebug> = new Map();

function resetCachedTreeItems(): void {
  taskTreeItemMap.clear();
  workspaceTreeItemMap.clear();
  projectTreeItemMap.clear();
  groupTreeItemMap.clear();
  workspaceJavaDebugMap.clear();
}

export class GradleTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private collapsed = true;
  private iconPathRunning?: IconPath;
  private iconPathIdle?: IconPath;
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  private _onDidBuildTreeItems: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  public readonly onDidBuildTreeItems: vscode.Event<null> = this
    ._onDidBuildTreeItems.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly taskProvider: GradleTaskProvider
  ) {
    this.iconPathRunning = {
      light: this.context.asAbsolutePath(
        path.join('resources', 'light', ICON_LOADING)
      ),
      dark: this.context.asAbsolutePath(
        path.join('resources', 'dark', ICON_LOADING)
      ),
    };
    this.iconPathIdle = {
      light: this.context.asAbsolutePath(
        path.join('resources', 'light', ICON_GRADLE_TASK)
      ),
      dark: this.context.asAbsolutePath(
        path.join('resources', 'dark', ICON_GRADLE_TASK)
      ),
    };
  }

  getIconPathRunning(): IconPath | undefined {
    return this.iconPathRunning;
  }

  getIconPathIdle(): IconPath | undefined {
    return this.iconPathRunning;
  }

  setCollapsed(collapsed: boolean): void {
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
    const tasks = await this.taskProvider.loadTasks();
    if (tasks.length === 0) {
      return [new NoTasksTreeItem(this.context)];
    } else {
      return this.buildItemsTreeFromTasks(tasks);
    }
  }

  refresh(treeItem: vscode.TreeItem | null = null): void {
    this._onDidChangeTreeData.fire(treeItem);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: vscode.TreeItem): vscode.TreeItem | null {
    if (
      element instanceof WorkspaceTreeItem ||
      element instanceof ProjectTreeItem ||
      element instanceof TreeItemWithTasksOrGroups ||
      element instanceof GradleTaskTreeItem
    ) {
      return element.parentTreeItem;
    }
    return null;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
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
      element instanceof NoTasksTreeItem
    ) {
      return [];
    }
    if (!element) {
      return await this.buildTreeItems();
    }
    return [];
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  buildItemsTreeFromTasks(
    tasks: vscode.Task[]
  ): WorkspaceTreeItem[] | NoTasksTreeItem[] {
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
          this.iconPathRunning!,
          this.iconPathIdle!,
          workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder))
        );

        taskTreeItemMap.set(task.definition.id, taskTreeItem);
        parentTreeItem.addTask(taskTreeItem);
      }
    });

    this._onDidBuildTreeItems.fire(null);

    if (workspaceTreeItemMap.size === 1) {
      return [
        ...workspaceTreeItemMap.values().next().value.projectFolders,
        ...workspaceTreeItemMap.values().next().value.projects,
      ];
    }
    return [...workspaceTreeItemMap.values()];
  }
}
