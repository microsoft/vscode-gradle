import * as path from 'path';
import * as vscode from 'vscode';

import {
  GradleTaskDefinition,
  isWorkspaceFolder,
  invalidateTasksCache,
  enableTaskDetection
} from './tasks';

import {
  getHasExplorerNestedSubProjects,
  getHasExplorerNestedGroups
} from './config';

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
  buildFileTreeItems: GradleBuildFileTreeItem[] = [];
  projects: SubProjectTreeItem[] = [];
  // workspaceFolder: vscode.WorkspaceFolder;

  constructor(
    name: string,
    // folder: vscode.WorkspaceFolder,
    resourceUri: vscode.Uri
  ) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'folder';
    this.resourceUri = resourceUri;
    // this.workspaceFolder = folder;
    this.iconPath = vscode.ThemeIcon.Folder;
  }

  addGradleBuildFileTreeItem(buildGradle: GradleBuildFileTreeItem) {
    this.buildFileTreeItems.push(buildGradle);
  }

  addProject(project: SubProjectTreeItem) {
    this.projects.push(project);
  }
}

class SubProjectTreeItem extends WorkspaceTreeItem {}

class GroupTreeItem extends vscode.TreeItem {
  public readonly parentTreeItem: GradleBuildFileTreeItem;
  public readonly tasks: GradleTaskTreeItem[] = [];

  constructor(
    name: string,
    parentTreeItem: GradleBuildFileTreeItem,
    resourceUri: vscode.Uri
  ) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'folder';
    this.resourceUri = resourceUri;
    this.iconPath = vscode.ThemeIcon.Folder;
    this.parentTreeItem = parentTreeItem;
  }

  addTask(task: GradleTaskTreeItem) {
    this.tasks.push(task);
  }
}

export class GradleBuildFileTreeItem extends vscode.TreeItem {
  path: string;
  private _tasks: GradleTaskTreeItem[] = [];
  private _subProjects: SubProjectTreeItem[] = [];
  private _groups: GroupTreeItem[] = [];

  static getLabel(relativePath: string, name: string): string {
    if (relativePath.length > 0) {
      return path.join(relativePath, name);
    }
    return name;
  }

  constructor(
    readonly workspaceTreeItem: WorkspaceTreeItem,
    readonly relativePath: string,
    readonly name: string
  ) {
    super(
      GradleBuildFileTreeItem.getLabel(relativePath, name),
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.contextValue = 'buildFile';
    this.path = relativePath;
    if (relativePath) {
      this.resourceUri = vscode.Uri.file(
        path.join(workspaceTreeItem!.resourceUri!.fsPath, relativePath, name)
      );
    } else {
      this.resourceUri = vscode.Uri.file(
        path.join(workspaceTreeItem!.resourceUri!.fsPath, name)
      );
    }
    this.iconPath = vscode.ThemeIcon.File;
  }

  addSubProject(subProject: SubProjectTreeItem) {
    this._subProjects.push(subProject);
  }

  addTask(task: GradleTaskTreeItem) {
    this._tasks.push(task);
  }

  addGroup(group: GroupTreeItem) {
    this._groups.push(group);
  }

  get subprojects() {
    return this._subProjects.sort(treeItemSortCompareFunc);
  }

  get tasks() {
    return this._tasks.sort(treeItemSortCompareFunc);
  }

  get groups() {
    return this._groups.sort(treeItemSortCompareFunc);
  }
}

class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly parentTreeItem: GradleBuildFileTreeItem | GroupTreeItem;
  public readonly execution: vscode.TaskExecution | undefined;

  constructor(
    context: vscode.ExtensionContext,
    parentTreeItem: GradleBuildFileTreeItem | GroupTreeItem,
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
  private taskTree:
    | WorkspaceTreeItem[]
    | GradleBuildFileTreeItem[]
    | NoTasksTreeItem[]
    | null = null;
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(private readonly extensionContext: vscode.ExtensionContext) {
    extensionContext.subscriptions.push(
      vscode.tasks.onDidStartTask(this.onTaskStatusChange, this)
    );
    extensionContext.subscriptions.push(
      vscode.tasks.onDidEndTask(this.onTaskStatusChange, this)
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

  stopTask(taskItem: GradleTaskTreeItem) {
    if (taskItem && taskItem.task) {
      const execution = getTaskExecution(taskItem.task);
      if (execution) {
        execution.terminate();
      }
    }
  }

  async openBuildFile(buildFileTreeItem: GradleBuildFileTreeItem) {
    const uri = buildFileTreeItem.resourceUri;
    if (uri) {
      await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(uri)
      );
    }
  }

  async addTask(buildFileTreeItem: GradleBuildFileTreeItem) {
    const uri = buildFileTreeItem.resourceUri;
    if (uri) {
      const textEditor = await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(uri)
      );

      const position = new vscode.Position(textEditor.document.lineCount, 0);
      textEditor.selection = new vscode.Selection(position, position);

      vscode.commands.executeCommand('editor.action.insertSnippet', {
        name: 'createGradleTask'
      });
    }
  }

  refresh(): Thenable<vscode.Task[]> {
    invalidateTasksCache();
    enableTaskDetection();
    this.taskTree = null;
    this.taskItemsPromise = vscode.tasks
      .fetchTasks({ type: 'gradle' })
      .then((tasks = []) => {
        this._onDidChangeTreeData.fire();
        return tasks;
      });
    return this.taskItemsPromise;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: vscode.TreeItem): vscode.TreeItem | null {
    if (element instanceof GroupTreeItem) {
      return element.parentTreeItem;
    }
    if (element instanceof WorkspaceTreeItem) {
      return null;
    }
    if (element instanceof GradleBuildFileTreeItem) {
      return element.workspaceTreeItem;
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
      return [...element.buildFileTreeItems, ...element.projects];
    }
    if (element instanceof GradleBuildFileTreeItem) {
      return [...element.subprojects, ...element.groups, ...element.tasks];
    }
    if (element instanceof SubProjectTreeItem) {
      return element.buildFileTreeItems;
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

  private buildTaskTree(
    tasks: vscode.Task[]
  ): WorkspaceTreeItem[] | GradleBuildFileTreeItem[] | NoTasksTreeItem[] {
    const workspaceTreeItems: Map<String, WorkspaceTreeItem> = new Map();
    const subProjectTreeItems: Map<String, SubProjectTreeItem> = new Map();
    const buildFileTreeItems: Map<String, GradleBuildFileTreeItem> = new Map();
    const groupTreeItems: Map<String, GroupTreeItem> = new Map();
    const subProjectBuildFileTreeItems: Map<
      String,
      GradleBuildFileTreeItem
    > = new Map();

    const showNestedSubProjects = getHasExplorerNestedSubProjects();
    const showNestedGroups = getHasExplorerNestedGroups();
    let workspaceTreeItem = null;
    let buildFileTreeItem: GradleBuildFileTreeItem | undefined;
    const hasSubProjects = tasks.some(task => !!task.definition.subproject);

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
        const definition: GradleTaskDefinition = <GradleTaskDefinition>(
          task.definition
        );
        const relativePath = definition.path ? definition.path : '';
        const fullPath = path.join(task.scope.name, relativePath);

        if (hasSubProjects && showNestedSubProjects) {
          this.addSubProject(
            task,
            subProjectTreeItems,
            subProjectBuildFileTreeItems,
            groupTreeItems,
            task.scope.uri,
            workspaceTreeItem,
            fullPath,
            relativePath,
            showNestedGroups
          );
        } else {
          buildFileTreeItem = buildFileTreeItems.get(fullPath);
          if (!buildFileTreeItem) {
            buildFileTreeItem = new GradleBuildFileTreeItem(
              workspaceTreeItem,
              relativePath,
              definition.fileName
            );
            workspaceTreeItem.addGradleBuildFileTreeItem(buildFileTreeItem);
            buildFileTreeItems.set(fullPath, buildFileTreeItem);
          }
          this.addGroupOrTask(
            showNestedGroups,
            groupTreeItems,
            task,
            task.name,
            buildFileTreeItem,
            task.scope.uri
          );
        }
      }
    });
    if (workspaceTreeItems.size === 1) {
      const workspaceTreeItem = workspaceTreeItems.values().next().value;
      return [
        ...workspaceTreeItem.buildFileTreeItems,
        ...workspaceTreeItem.projects
      ];
    }
    return [...workspaceTreeItems.values()];
  }

  private addSubProject(
    task: vscode.Task,
    subProjectTreeItems: Map<String, SubProjectTreeItem>,
    subProjectBuildFileTreeItems: Map<String, GradleBuildFileTreeItem>,
    groupTreeItems: Map<String, GroupTreeItem>,
    resourceUri: vscode.Uri,
    workspaceTreeItem: WorkspaceTreeItem,
    fullPath: string,
    relativePath: string,
    showNestedGroups: boolean
  ) {
    const subProjectName = task.definition.subproject || 'root-project';
    let subProjectTreeItem = subProjectTreeItems.get(subProjectName);
    if (!subProjectTreeItem) {
      subProjectTreeItem = new SubProjectTreeItem(
        subProjectName,
        vscode.Uri.file(path.join(resourceUri.fsPath, subProjectName))
      );
      workspaceTreeItem.addProject(subProjectTreeItem);
      subProjectTreeItems.set(subProjectName, subProjectTreeItem);
    }
    const subProjectPath = path.join(fullPath, subProjectName);
    let subProjectBuildFileTreeItem = subProjectBuildFileTreeItems.get(
      subProjectPath
    );
    if (!subProjectBuildFileTreeItem) {
      subProjectBuildFileTreeItem = new GradleBuildFileTreeItem(
        subProjectTreeItem,
        relativePath,
        task.definition.fileName
      );
      subProjectTreeItem.addGradleBuildFileTreeItem(
        subProjectBuildFileTreeItem
      );
      subProjectBuildFileTreeItems.set(
        subProjectPath,
        subProjectBuildFileTreeItem
      );
    }
    this.addGroupOrTask(
      showNestedGroups,
      groupTreeItems,
      task,
      task.name,
      subProjectBuildFileTreeItem,
      resourceUri
    );
  }

  private addGroupOrTask(
    showNestedGroups: boolean,
    groupTreeItems: Map<String, GroupTreeItem>,
    task: vscode.Task,
    taskName: string,
    buildFileTreeItem: GradleBuildFileTreeItem,
    resourceUri: vscode.Uri
  ) {
    let parentTreeItem:
      | GradleBuildFileTreeItem
      | GroupTreeItem = buildFileTreeItem;
    if (showNestedGroups) {
      const groupId = task.definition.group + task.definition.subproject;
      let groupTreeItem = groupTreeItems.get(groupId);
      if (!groupTreeItem) {
        groupTreeItem = new GroupTreeItem(
          task.definition.group,
          buildFileTreeItem,
          resourceUri
        );
        buildFileTreeItem.addGroup(groupTreeItem);
        groupTreeItems.set(groupId, groupTreeItem);
      }
      parentTreeItem = groupTreeItem;
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
}
