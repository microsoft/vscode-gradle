import * as path from 'path';
import * as vscode from 'vscode';

import {
  // GradleTaskDefinition,
  isWorkspaceFolder,
  invalidateTasksCache,
  enableTaskDetection,
  cloneTask
} from './tasks';

function getTaskExecution(task: vscode.Task) {
  return vscode.tasks.taskExecutions.find(
    e =>
      e.task.name === task.name &&
      e.task.source === task.source &&
      e.task.scope === task.scope &&
      e.task.definition.path === task.definition.path
  );
}

function treeItemSortCompareFunc(a: vscode.TreeItem, b: vscode.TreeItem) {
  return a.label!.localeCompare(b.label!);
}

class WorkspaceTreeItem extends vscode.TreeItem {
  projects: ProjectTreeItem[] = [];

  constructor(name: string, resourceUri: vscode.Uri) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'folder';
    this.resourceUri = resourceUri;
    this.iconPath = vscode.ThemeIcon.Folder;
  }

  addProject(project: ProjectTreeItem) {
    this.projects.push(project);
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

  addTask(task: GradleTaskTreeItem) {
    this._tasks.push(task);
  }

  get tasks(): GradleTaskTreeItem[] {
    return this._tasks.sort(treeItemSortCompareFunc);
  }

  addGroup(group: GroupTreeItem) {
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
    private collapsed: boolean = true
  ) {
    extensionContext.subscriptions.push(
      vscode.tasks.onDidStartTask(this.onTaskStatusChange, this)
    );
    extensionContext.subscriptions.push(
      vscode.tasks.onDidEndTask(this.onTaskStatusChange, this)
    );
    this.setCollapsed(collapsed);
  }

  setCollapsed(collapsed: boolean) {
    this.collapsed = collapsed;
    vscode.commands.executeCommand(
      'setContext',
      'gradle:explorerCollapsed',
      collapsed
    );
  }

  onTaskStatusChange(event: vscode.TaskStartEvent) {
    this.taskTree = null;
    this._onDidChangeTreeData.fire(event.execution.task.definition.treeItem);
  }

  runTask(taskItem: GradleTaskTreeItem) {
    if (taskItem && taskItem.task) {
      vscode.tasks.executeTask(taskItem.task);
    }
  }

  async runTaskWithArgs(taskItem: GradleTaskTreeItem) {
    if (taskItem && taskItem.task) {
      const args = await vscode.window.showInputBox({
        placeHolder: 'For example: --all',
        ignoreFocusOut: true
      });
      if (args !== undefined) {
        const task = await cloneTask(taskItem!.task, args.split(' '));
        if (task) {
          vscode.tasks.executeTask(task);
        }
      }
    }
  }

  stopTask(taskItem: GradleTaskTreeItem) {
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
    this.taskItemsPromise = vscode.tasks.fetchTasks({ type: 'gradle' });
    this.render();
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
      return null;
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
      return [...element.projects];
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
    if (!element) {
      if (this.taskTree) {
        return this.taskTree;
      }
    }
    return [];
  }

  buildTaskTree(tasks: vscode.Task[]): WorkspaceTreeItem[] | NoTasksTreeItem[] {
    const workspaceTreeItems: Map<String, WorkspaceTreeItem> = new Map();
    const projectTreeItems: Map<String, ProjectTreeItem> = new Map();
    const groupTreeItems: Map<String, GroupTreeItem> = new Map();
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

        let taskName: string = task.name;
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
          taskName = task.name.split(':').pop() as string;
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
      const workspaceTreeItem = workspaceTreeItems.values().next().value;
      return workspaceTreeItem.projects;
    }
    return [...workspaceTreeItems.values()];
  }
}
