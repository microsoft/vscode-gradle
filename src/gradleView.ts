import * as path from 'path';
import * as vscode from 'vscode';

import {
  // GradleTaskDefinition,
  isWorkspaceFolder,
  invalidateTasksCache,
  enableTaskDetection,
  cloneTask
} from './tasks';
import { GradleTasksClient } from './server';

function getTaskExecution(task: vscode.Task): vscode.TaskExecution | undefined {
  return vscode.tasks.taskExecutions.find(
    e =>
      e.task.name === task.name &&
      e.task.source === task.source &&
      e.task.scope === task.scope &&
      e.task.definition.path === task.definition.path
  );
}

function treeItemSortCompareFunc(
  a: vscode.TreeItem,
  b: vscode.TreeItem
): number {
  return a.label!.localeCompare(b.label!);
}

class WorkspaceTreeItem extends vscode.TreeItem {
  projects: ProjectTreeItem[] = [];
  projectFolders: WorkspaceTreeItem[] = [];
  parentTreeItem: WorkspaceTreeItem | null = null;

  constructor(name: string, resourceUri: vscode.Uri) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'folder';
    this.resourceUri = resourceUri;
    this.iconPath = vscode.ThemeIcon.Folder;
  }

  addProject(project: ProjectTreeItem): void {
    this.projects.push(project);
  }

  addProjectFolder(projectFolder: WorkspaceTreeItem): void {
    this.projectFolders.push(projectFolder);
  }
}

class TreeItemWithTasksOrGroups extends vscode.TreeItem {
  private _tasks: GradleTaskTreeItem[] = [];
  private _groups: GroupTreeItem[] = [];
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly iconPath = vscode.ThemeIcon.Folder;
  public readonly contextValue = 'folder';
  constructor(
    name: string,
    parentTreeItem: vscode.TreeItem,
    resourceUri: vscode.Uri | undefined,
    collapsibleState = vscode.TreeItemCollapsibleState.Expanded
  ) {
    super(name, collapsibleState);
    this.resourceUri = resourceUri;
    this.parentTreeItem = parentTreeItem;
  }

  addTask(task: GradleTaskTreeItem): void {
    this._tasks.push(task);
  }

  get tasks(): GradleTaskTreeItem[] {
    return this._tasks.sort(treeItemSortCompareFunc);
  }

  addGroup(group: GroupTreeItem): void {
    this._groups.push(group);
  }

  get groups(): GroupTreeItem[] {
    return this._groups.sort(treeItemSortCompareFunc);
  }
}

class ProjectTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.File;
}

class GroupTreeItem extends TreeItemWithTasksOrGroups {
  constructor(
    name: string,
    parentTreeItem: vscode.TreeItem,
    resourceUri: vscode.Uri | undefined
  ) {
    super(
      name,
      parentTreeItem,
      resourceUri,
      vscode.TreeItemCollapsibleState.Collapsed
    );
  }
}

export class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly execution: vscode.TaskExecution | undefined;

  constructor(
    context: vscode.ExtensionContext,
    parentTreeItem: vscode.TreeItem,
    task: vscode.Task,
    label: string,
    description?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: 'Run Task',
      command: 'gradle.runTask',
      arguments: [this]
    };
    this.tooltip = description || label;
    this.parentTreeItem = parentTreeItem;
    this.task = task;
    this.execution = getTaskExecution(task);
    this.contextValue = this.execution ? 'runningTask' : 'task';

    if (this.execution) {
      this.iconPath = {
        light: context.asAbsolutePath(
          path.join('resources', 'light', 'loading.svg')
        ),
        dark: context.asAbsolutePath(
          path.join('resources', 'dark', 'loading.svg')
        )
      };
    } else {
      this.iconPath = {
        light: context.asAbsolutePath(
          path.join('resources', 'light', 'script.svg')
        ),
        dark: context.asAbsolutePath(
          path.join('resources', 'dark', 'script.svg')
        )
      };
    }
  }
}

class NoTasksTreeItem extends vscode.TreeItem {
  constructor() {
    super('No tasks found', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'notasks';
  }
}

export class GradleTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private taskItemsPromise: Thenable<vscode.Task[]> = Promise.resolve([]);
  private taskTree: WorkspaceTreeItem[] | NoTasksTreeItem[] | null = null;

  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private collapsed: boolean = true,
    private readonly client: GradleTasksClient
  ) {
    extensionContext.subscriptions.push(
      vscode.tasks.onDidStartTask(this.onTaskStatusChange, this)
    );
    extensionContext.subscriptions.push(
      vscode.tasks.onDidEndTask(this.onTaskStatusChange, this)
    );
    this.setCollapsed(collapsed);
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.extensionContext.workspaceState.update('explorerCollapsed', collapsed);
    vscode.commands.executeCommand(
      'setContext',
      'gradle:explorerCollapsed',
      collapsed
    );
    this.render();
  }

  onTaskStatusChange(event: vscode.TaskStartEvent): void {
    this.taskTree = null;
    this._onDidChangeTreeData.fire(event.execution.task.definition.treeItem);
  }

  runTask(taskItem: GradleTaskTreeItem): void {
    if (taskItem && taskItem.task) {
      vscode.tasks.executeTask(taskItem.task);
    }
  }

  async runTaskWithArgs(taskItem: GradleTaskTreeItem): Promise<void> {
    if (taskItem && taskItem.task) {
      const args = await vscode.window.showInputBox({
        placeHolder: 'For example: --all',
        ignoreFocusOut: true
      });
      if (args !== undefined) {
        const task = await cloneTask(
          taskItem.task,
          args.split(' '),
          this.client
        );
        if (task) {
          vscode.tasks.executeTask(task);
        }
      }
    }
  }

  stopTask(taskItem: GradleTaskTreeItem): void {
    if (taskItem && taskItem.task) {
      const execution = getTaskExecution(taskItem.task);
      if (execution) {
        execution.terminate();
      }
    }
  }

  refresh(): Thenable<vscode.Task[]> {
    enableTaskDetection();
    invalidateTasksCache();
    this.taskItemsPromise = vscode.tasks
      .fetchTasks({ type: 'gradle' })
      .then(tasks => {
        this.render();
        return tasks;
      });
    return this.taskItemsPromise;
  }

  render(): void {
    this.taskTree = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: vscode.TreeItem): vscode.TreeItem | null {
    if (element instanceof WorkspaceTreeItem) {
      return element.parentTreeItem;
    }
    if (element instanceof ProjectTreeItem) {
      return element.parentTreeItem;
    }
    if (element instanceof TreeItemWithTasksOrGroups) {
      return element.parentTreeItem;
    }
    if (element instanceof GradleTaskTreeItem) {
      return element.parentTreeItem;
    }
    if (element instanceof NoTasksTreeItem) {
      return null;
    }
    return null;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!this.taskTree) {
      const taskItems = await this.taskItemsPromise;
      if (taskItems) {
        this.taskTree = this.buildTaskTree(taskItems);
        if (this.taskTree.length === 0) {
          this.taskTree = [new NoTasksTreeItem()];
        }
      }
    }
    if (element instanceof WorkspaceTreeItem) {
      return [...element.projectFolders, ...element.projects];
    }
    if (element instanceof ProjectTreeItem) {
      return [...element.groups, ...element.tasks];
    }
    if (element instanceof GroupTreeItem) {
      return element.tasks;
    }
    if (element instanceof GradleTaskTreeItem) {
      return [];
    }
    if (element instanceof NoTasksTreeItem) {
      return [];
    }
    if (!element && this.taskTree) {
      return this.taskTree;
    }
    return [];
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  buildTaskTree(tasks: vscode.Task[]): WorkspaceTreeItem[] | NoTasksTreeItem[] {
    const workspaceTreeItems: Map<string, WorkspaceTreeItem> = new Map();
    const nestedWorkspaceTreeItems: Map<string, WorkspaceTreeItem> = new Map();
    const projectTreeItems: Map<string, ProjectTreeItem> = new Map();
    const groupTreeItems: Map<string, GroupTreeItem> = new Map();
    let workspaceTreeItem = null;

    tasks.forEach(task => {
      if (isWorkspaceFolder(task.scope)) {
        workspaceTreeItem = workspaceTreeItems.get(task.scope.name);
        if (!workspaceTreeItem) {
          workspaceTreeItem = new WorkspaceTreeItem(
            task.scope.name,
            task.scope.uri
          );
          workspaceTreeItems.set(task.scope.name, workspaceTreeItem);
        }

        if (task.definition.projectFolder !== task.definition.workspaceFolder) {
          const relativePath = path.relative(
            task.definition.workspaceFolder,
            task.definition.projectFolder
          );
          let nestedWorkspaceTreeItem = nestedWorkspaceTreeItems.get(
            relativePath
          );
          if (!nestedWorkspaceTreeItem) {
            nestedWorkspaceTreeItem = new WorkspaceTreeItem(
              relativePath,
              vscode.Uri.file(task.definition.projectFolder)
            );
            nestedWorkspaceTreeItems.set(relativePath, nestedWorkspaceTreeItem);
            nestedWorkspaceTreeItem.parentTreeItem = workspaceTreeItem;
            workspaceTreeItem.addProjectFolder(nestedWorkspaceTreeItem);
          }
          workspaceTreeItem = nestedWorkspaceTreeItem;
        }

        const projectName = this.collapsed
          ? task.definition.rootProject
          : task.definition.project;
        let projectTreeItem = projectTreeItems.get(projectName);
        if (!projectTreeItem) {
          projectTreeItem = new ProjectTreeItem(
            projectName,
            workspaceTreeItem,
            vscode.Uri.file(task.definition.buildFile)
          );
          workspaceTreeItem.addProject(projectTreeItem);
          projectTreeItems.set(projectName, projectTreeItem);
        }

        let taskName: string = task.definition.script;
        let parentTreeItem: ProjectTreeItem | GroupTreeItem = projectTreeItem;

        if (!this.collapsed) {
          const groupId = task.definition.group + task.definition.project;
          let groupTreeItem = groupTreeItems.get(groupId);
          if (!groupTreeItem) {
            groupTreeItem = new GroupTreeItem(
              task.definition.group,
              workspaceTreeItem,
              undefined
            );
            projectTreeItem.addGroup(groupTreeItem);
            groupTreeItems.set(groupId, groupTreeItem);
          }
          parentTreeItem = groupTreeItem;
          taskName = task.definition.script.split(':').pop() as string;
        }

        parentTreeItem.addTask(
          new GradleTaskTreeItem(
            this.extensionContext,
            parentTreeItem,
            task,
            taskName,
            task.definition.description
          )
        );
      }
    });
    if (workspaceTreeItems.size === 1) {
      return [
        ...workspaceTreeItems.values().next().value.projectFolders,
        ...workspaceTreeItems.values().next().value.projects
      ];
    }
    return [...workspaceTreeItems.values()];
  }
}
