import * as path from 'path';
import {
  Event,
  EventEmitter,
  ExtensionContext,
  ThemeIcon,
  TreeDataProvider,
  TreeItem,
  Task,
  TreeItemCollapsibleState,
  Uri,
  WorkspaceFolder,
  commands,
  tasks,
  TaskGroup
} from 'vscode';

import { GradleTaskDefinition, isWorkspaceFolder } from './tasks';

class Folder extends TreeItem {
  gradleTasks: BuildGradleTreeItem[] = [];
  workspaceFolder: WorkspaceFolder;

  constructor(folder: WorkspaceFolder) {
    super(folder.name, TreeItemCollapsibleState.Expanded);
    this.contextValue = 'folder';
    this.resourceUri = folder.uri;
    this.workspaceFolder = folder;
    this.iconPath = ThemeIcon.Folder;
  }

  addBuildGradleTreeItem(buildGradle: BuildGradleTreeItem) {
    this.gradleTasks.push(buildGradle);
  }
}

const packageName = 'build.gradle';

type ExplorerCommands = 'run';

class GradleTaskItem extends TreeItem {
  task: Task;
  buildGradle: BuildGradleTreeItem;

  constructor(
    context: ExtensionContext,
    buildGradle: BuildGradleTreeItem,
    task: Task
  ) {
    super(task.name, TreeItemCollapsibleState.None);
    const command: ExplorerCommands = 'run';

    const commandList = {
      run: {
        title: 'Run Task',
        command: 'gradle.runTask',
        arguments: [this]
      }
    };
    this.contextValue = 'task';
    if (task.group && task.group === TaskGroup.Rebuild) {
      this.contextValue = 'debugScript';
    }
    this.buildGradle = buildGradle;
    this.task = task;
    this.command = commandList[command];

    this.iconPath = {
      light: context.asAbsolutePath(
        path.join('resources', 'light', 'script.svg')
      ),
      dark: context.asAbsolutePath(path.join('resources', 'dark', 'script.svg'))
    };
  }

  getFolder(): WorkspaceFolder {
    return this.buildGradle.folder.workspaceFolder;
  }
}

class BuildGradleTreeItem extends TreeItem {
  path: string;
  folder: Folder;
  tasks: GradleTaskItem[] = [];

  static getLabel(_folderName: string, relativePath: string): string {
    if (relativePath.length > 0) {
      return path.join(relativePath, packageName);
    }
    return packageName;
  }

  constructor(folder: Folder, relativePath: string) {
    super(
      BuildGradleTreeItem.getLabel(folder.label!, relativePath),
      TreeItemCollapsibleState.Expanded
    );
    this.folder = folder;
    this.path = relativePath;
    this.contextValue = 'build.gradle';
    if (relativePath) {
      this.resourceUri = Uri.file(
        path.join(folder!.resourceUri!.fsPath, relativePath, packageName)
      );
    } else {
      this.resourceUri = Uri.file(
        path.join(folder!.resourceUri!.fsPath, packageName)
      );
    }
    this.iconPath = ThemeIcon.File;
  }

  addTask(task: GradleTaskItem) {
    this.tasks.push(task);
  }
}

class NoTasksTreeItem extends TreeItem {
  constructor() {
    super('No tasks found', TreeItemCollapsibleState.None);
    this.contextValue = 'notasks';
  }
}

export class GradleTasksTreeDataProvider implements TreeDataProvider<TreeItem> {
  private taskTree:
    | Folder[]
    | BuildGradleTreeItem[]
    | NoTasksTreeItem[]
    | null = null;
  private extensionContext: ExtensionContext;
  private _onDidChangeTreeData: EventEmitter<TreeItem | null> = new EventEmitter<TreeItem | null>();
  readonly onDidChangeTreeData: Event<TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(context: ExtensionContext) {
    const subscriptions = context.subscriptions;
    this.extensionContext = context;
    subscriptions.push(
      commands.registerCommand('gradle.runTask', this.runTask, this)
    );
    subscriptions.push(
      commands.registerCommand('gradle.refresh', this.refresh, this)
    );
  }

  private async runTask(task: GradleTaskItem) {
    tasks.executeTask(task.task);
  }

  public refresh() {
    this.taskTree = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  getParent(element: TreeItem): TreeItem | null {
    if (element instanceof Folder) {
      return null;
    }
    if (element instanceof BuildGradleTreeItem) {
      return element.folder;
    }
    if (element instanceof GradleTaskItem) {
      return element.buildGradle;
    }
    if (element instanceof NoTasksTreeItem) {
      return null;
    }
    return null;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!this.taskTree) {
      let taskItems = await tasks.fetchTasks({ type: 'gradle' });
      if (taskItems) {
        this.taskTree = this.buildTaskTree(taskItems);
        if (this.taskTree.length === 0) {
          this.taskTree = [new NoTasksTreeItem()];
        }
      }
    }
    if (element instanceof Folder) {
      return element.gradleTasks;
    }
    if (element instanceof BuildGradleTreeItem) {
      return element.tasks;
    }
    if (element instanceof GradleTaskItem) {
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
    tasks: Task[]
  ): Folder[] | BuildGradleTreeItem[] | NoTasksTreeItem[] {
    let folders: Map<String, Folder> = new Map();
    let gradleTasks: Map<String, BuildGradleTreeItem> = new Map();

    let folder = null;
    let buildGradle = null;

    tasks.forEach(task => {
      if (isWorkspaceFolder(task.scope)) {
        folder = folders.get(task.scope.name);
        if (!folder) {
          folder = new Folder(task.scope);
          folders.set(task.scope.name, folder);
        }
        let definition: GradleTaskDefinition = <GradleTaskDefinition>(
          task.definition
        );
        let relativePath = definition.path ? definition.path : '';
        let fullPath = path.join(task.scope.name, relativePath);
        buildGradle = gradleTasks.get(fullPath);
        if (!buildGradle) {
          buildGradle = new BuildGradleTreeItem(folder, relativePath);
          folder.addBuildGradleTreeItem(buildGradle);
          gradleTasks.set(fullPath, buildGradle);
        }
        let gradleTask = new GradleTaskItem(
          this.extensionContext,
          buildGradle,
          task
        );
        buildGradle.addTask(gradleTask);
      }
    });
    if (folders.size === 1) {
      return [...gradleTasks.values()];
    }
    return [...folders.values()];
  }
}
