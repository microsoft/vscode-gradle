import * as path from 'path';
import * as vscode from 'vscode';

import {
  GradleTaskDefinition,
  isWorkspaceFolder,
  invalidateTasksCache,
  enableTaskDetection
} from './tasks';

import { getHasExplorerNestedSubProjects } from './config';

class WorkspaceTreeItem extends vscode.TreeItem {
  buildFileTreeItems: GradleBuildFileTreeItem[] = [];
  workspaceFolder: vscode.WorkspaceFolder;

  constructor(
    name: string,
    folder: vscode.WorkspaceFolder,
    resourceUri: vscode.Uri
  ) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'folder';
    this.resourceUri = resourceUri;
    this.workspaceFolder = folder;
    this.iconPath = vscode.ThemeIcon.Folder;
  }

  addGradleBuildFileTreeItem(buildGradle: GradleBuildFileTreeItem) {
    this.buildFileTreeItems.push(buildGradle);
  }
}

export class GradleBuildFileTreeItem extends vscode.TreeItem {
  path: string;
  tasks: GradleTaskTreeItem[] = [];
  subProjects: SubProjectTreeItem[] = [];

  static getLabel(relativePath: string, name: string): string {
    if (relativePath.length > 0) {
      return path.join(relativePath, name);
    }
    return name;
  }

  constructor(
    readonly workspaceTreeItem: WorkspaceTreeItem,
    relativePath: string,
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

  addSubProjectTreeItem(subProject: SubProjectTreeItem) {
    this.subProjects.push(subProject);
  }

  addTask(task: GradleTaskTreeItem) {
    this.tasks.push(task);
  }
}

class SubProjectTreeItem extends WorkspaceTreeItem {}

class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly folderTreeItem: GradleBuildFileTreeItem;
  public readonly execution: vscode.TaskExecution | undefined;

  constructor(
    context: vscode.ExtensionContext,
    folderTreeItem: GradleBuildFileTreeItem,
    task: vscode.Task,
    label: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: 'Run Task',
      command: 'gradle.runTask',
      arguments: [this]
    };
    this.contextValue = 'task';
    this.folderTreeItem = folderTreeItem;
    this.task = task;

    this.iconPath = {
      light: context.asAbsolutePath(
        path.join('resources', 'light', 'script.svg')
      ),
      dark: context.asAbsolutePath(path.join('resources', 'dark', 'script.svg'))
    };
  }

  getFolder(): vscode.WorkspaceFolder {
    return this.folderTreeItem.workspaceTreeItem.workspaceFolder;
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

  constructor(private readonly extensionContext: vscode.ExtensionContext) {}

  runTask(taskItem: GradleTaskTreeItem) {
    if (taskItem && taskItem.task) {
      vscode.tasks.executeTask(taskItem.task);
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
    if (element instanceof WorkspaceTreeItem) {
      return null;
    }
    if (element instanceof GradleBuildFileTreeItem) {
      return element.workspaceTreeItem;
    }
    if (element instanceof GradleTaskTreeItem) {
      return element.folderTreeItem;
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
      return element.buildFileTreeItems;
    }
    if (element instanceof GradleBuildFileTreeItem) {
      return [...element.subProjects, ...element.tasks];
    }
    if (element instanceof SubProjectTreeItem) {
      return element.buildFileTreeItems;
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
    const subProjectBuildFileTreeItems: Map<
      String,
      GradleBuildFileTreeItem
    > = new Map();

    const showNestedSubProjects = getHasExplorerNestedSubProjects();
    let workspaceTreeItem = null;
    let buildFileTreeItem = null;

    tasks.forEach(task => {
      if (isWorkspaceFolder(task.scope)) {
        workspaceTreeItem = workspaceTreeItems.get(task.scope.name);
        if (!workspaceTreeItem) {
          workspaceTreeItem = new WorkspaceTreeItem(
            task.scope.name,
            task.scope,
            task.scope.uri
          );
          workspaceTreeItems.set(task.scope.name, workspaceTreeItem);
        }
        const definition: GradleTaskDefinition = <GradleTaskDefinition>(
          task.definition
        );
        const relativePath = definition.path ? definition.path : '';
        const fullPath = path.join(task.scope.name, relativePath);
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
        if (showNestedSubProjects && definition.script.includes(':')) {
          const [subProjectName] = definition.script.split(':');
          let subProjectTreeItem = subProjectTreeItems.get(subProjectName);
          if (!subProjectTreeItem) {
            subProjectTreeItem = new SubProjectTreeItem(
              subProjectName,
              task.scope,
              vscode.Uri.file(path.join(task.scope.uri.fsPath, subProjectName))
            );
            buildFileTreeItem.addSubProjectTreeItem(subProjectTreeItem);
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
              definition.fileName
            );
            subProjectTreeItem.addGradleBuildFileTreeItem(
              subProjectBuildFileTreeItem
            );
            subProjectBuildFileTreeItems.set(
              subProjectPath,
              subProjectBuildFileTreeItem
            );
          }
          const gradleTask = new GradleTaskTreeItem(
            this.extensionContext,
            subProjectBuildFileTreeItem,
            task,
            task.name.replace(/[^:]+:/, '')
          );
          subProjectBuildFileTreeItem.addTask(gradleTask);
        } else {
          const gradleTask = new GradleTaskTreeItem(
            this.extensionContext,
            buildFileTreeItem,
            task,
            task.name
          );
          buildFileTreeItem.addTask(gradleTask);
        }
      }
    });
    if (workspaceTreeItems.size === 1) {
      return [...buildFileTreeItems.values()];
    }
    return [...workspaceTreeItems.values()];
  }
}
