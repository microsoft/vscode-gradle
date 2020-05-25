import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceTreeItem } from './WorkspaceTreeItem';
import { NoTasksTreeItem } from './NoTasksTreeItem';
import { IconPath } from './types';
import { GradleTaskTreeItem } from './GradleTaskTreeItem';
import { ProjectTreeItem } from './ProjectTreeItem';
import { TreeItemWithTasksOrGroups } from './TreeItemWithTasksOrGroups';
import { GroupTreeItem } from './GroupTreeItem';
import { JavaDebug, getConfigJavaDebug } from '../config';
import { GradleTaskDefinition } from '../tasks/GradleTaskDefinition';
import { ICON_LOADING, ICON_GRADLE_TASK } from './constants';
import { isWorkspaceFolder } from '../util';

export const taskTreeItemMap: Map<string, GradleTaskTreeItem> = new Map();

export class GradleTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private collapsed = true;
  // private treeItems: WorkspaceTreeItem[] | NoTasksTreeItem[] | null = null;
  private iconPathRunning?: IconPath;
  private iconPathIdle?: IconPath;
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {
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
    this.context.workspaceState.update('explorerCollapsed', collapsed);
    vscode.commands.executeCommand(
      'setContext',
      'gradle:explorerCollapsed',
      collapsed
    );
    // this.buildTreeItems();
    this.render();
  }

  async refresh(): Promise<void> {
    this.render();
  }

  private async buildTreeItems(): Promise<vscode.TreeItem[]> {
    taskTreeItemMap.clear();
    const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
    if (tasks.length === 0) {
      return [new NoTasksTreeItem(this.context)];
    } else {
      return this.buildItemsTreeFromTasks(tasks);
    }
  }

  // setTaskItems(tasks: vscode.Task[]): void {
  //   this.taskItems = tasks;
  // }

  renderTask(task: vscode.Task): void {
    const treeItem = taskTreeItemMap.get(task.definition.id);
    treeItem?.setContext();
    this.render(treeItem);
  }

  render(treeItem: vscode.TreeItem | null = null): void {
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

  // TODO
  findProjectTreeItem(uri: vscode.Uri): ProjectTreeItem | undefined {
    console.log('uri', uri);
    // if (this.treeItems) {
    //   return this.treeItems.find((element: vscode.TreeItem) => {
    //     return (
    //       element instanceof ProjectTreeItem &&
    //       element.resourceUri?.fsPath === uri.fsPath
    //     );
    //   }) as ProjectTreeItem | undefined;
    // }
    return undefined;
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  buildItemsTreeFromTasks(
    tasks: vscode.Task[]
  ): WorkspaceTreeItem[] | NoTasksTreeItem[] {
    const workspaceTreeItems: Map<string, WorkspaceTreeItem> = new Map();
    const projectTreeItems: Map<string, ProjectTreeItem> = new Map();
    const groupTreeItems: Map<string, GroupTreeItem> = new Map();
    const workspaceJavaDebug: Map<string, JavaDebug> = new Map();
    let workspaceTreeItem = null;

    tasks.forEach((task) => {
      const definition = task.definition as GradleTaskDefinition;
      if (isWorkspaceFolder(task.scope) && definition.buildFile) {
        workspaceTreeItem = workspaceTreeItems.get(task.scope.name);
        if (!workspaceTreeItem) {
          workspaceTreeItem = new WorkspaceTreeItem(
            task.scope.name,
            task.scope.uri
          );
          workspaceTreeItems.set(task.scope.name, workspaceTreeItem);
        }

        if (!workspaceJavaDebug.has(task.scope.name)) {
          workspaceJavaDebug.set(
            task.scope.name,
            getConfigJavaDebug(task.scope as vscode.WorkspaceFolder)
          );
        }

        const projectName = this.collapsed
          ? definition.rootProject
          : definition.project;
        let projectTreeItem = projectTreeItems.get(projectName);
        if (!projectTreeItem) {
          projectTreeItem = new ProjectTreeItem(
            projectName,
            workspaceTreeItem,
            vscode.Uri.file(definition.buildFile)
          );
          workspaceTreeItem.addProject(projectTreeItem);
          projectTreeItems.set(projectName, projectTreeItem);
        }

        const taskName = definition.script.slice(
          definition.script.lastIndexOf(':') + 1
        );
        let parentTreeItem: ProjectTreeItem | GroupTreeItem = projectTreeItem;

        if (!this.collapsed) {
          const groupId = definition.group + definition.project;
          let groupTreeItem = groupTreeItems.get(groupId);
          if (!groupTreeItem) {
            groupTreeItem = new GroupTreeItem(
              definition.group,
              workspaceTreeItem,
              undefined
            );
            projectTreeItem.addGroup(groupTreeItem);
            groupTreeItems.set(groupId, groupTreeItem);
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
          workspaceJavaDebug.get(task.scope.name)
        );

        taskTreeItemMap.set(task.definition.id, taskTreeItem);
        parentTreeItem.addTask(taskTreeItem);
      }
    });

    if (workspaceTreeItems.size === 1) {
      return [
        ...workspaceTreeItems.values().next().value.projectFolders,
        ...workspaceTreeItems.values().next().value.projects,
      ];
    }
    return [...workspaceTreeItems.values()];
  }
}
