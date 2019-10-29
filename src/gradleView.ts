import * as path from 'path';
import {
  workspace,
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

import {
  GradleTaskDefinition,
  isWorkspaceFolder,
  invalidateTasksCache,
  enableTaskDetection
} from './tasks';

class Folder extends TreeItem {
  gradleTasks: GradleTreeItem[] = [];
  workspaceFolder: WorkspaceFolder;

  constructor(folder: WorkspaceFolder) {
    super(folder.name, TreeItemCollapsibleState.Expanded);
    this.contextValue = 'folder';
    this.resourceUri = folder.uri;
    this.workspaceFolder = folder;
    this.iconPath = ThemeIcon.Folder;
  }

  addGradleTreeItem(buildGradle: GradleTreeItem) {
    this.gradleTasks.push(buildGradle);
  }
}

type ExplorerCommands = 'run';

class GradleTaskItem extends TreeItem {
  task: Task;
  buildGradle: GradleTreeItem;

  constructor(
    context: ExtensionContext,
    buildGradle: GradleTreeItem,
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

class GradleTreeItem extends TreeItem {
  path: string;
  folder: Folder;
  tasks: GradleTaskItem[] = [];

  static getLabel(
    _folderName: string,
    relativePath: string,
    buildFile: string
  ): string {
    if (relativePath.length > 0) {
      return path.join(relativePath, buildFile);
    }
    return buildFile;
  }

  constructor(folder: Folder, relativePath: string, buildFile: string) {
    super(
      GradleTreeItem.getLabel(folder.label!, relativePath, buildFile),
      TreeItemCollapsibleState.Expanded
    );
    this.folder = folder;
    this.path = relativePath;
    this.contextValue = buildFile;
    if (relativePath) {
      this.resourceUri = Uri.file(
        path.join(folder!.resourceUri!.fsPath, relativePath, buildFile)
      );
    } else {
      this.resourceUri = Uri.file(
        path.join(folder!.resourceUri!.fsPath, buildFile)
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
    | GradleTreeItem[]
    | NoTasksTreeItem[]
    | null = null;
  private extensionContext: ExtensionContext;
  private _onDidChangeTreeData: EventEmitter<TreeItem | null> = new EventEmitter<TreeItem | null>();
  readonly onDidChangeTreeData: Event<TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(context: ExtensionContext) {
    this.extensionContext = context;
    const subscriptions = context.subscriptions;
    subscriptions.push(
      commands.registerCommand('gradle.runTask', this.runTask, this)
    );
    subscriptions.push(
      commands.registerCommand('gradle.refresh', this.refresh, this)
    );
  }

  private async runTask(taskItem: GradleTaskItem) {
    if (taskItem && taskItem.task) {
      tasks.executeTask(taskItem.task);
    }
  }

  public refresh() {
    invalidateTasksCache();
    enableTaskDetection();
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
    if (element instanceof GradleTreeItem) {
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
      const taskItems = await tasks.fetchTasks({ type: 'gradle' });
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
    if (element instanceof GradleTreeItem) {
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
  ): Folder[] | GradleTreeItem[] | NoTasksTreeItem[] {
    const folders: Map<String, Folder> = new Map();
    const gradleTasks: Map<String, GradleTreeItem> = new Map();

    let folder = null;
    let buildGradle = null;

    tasks.forEach(task => {
      if (isWorkspaceFolder(task.scope)) {
        folder = folders.get(task.scope.name);
        if (!folder) {
          folder = new Folder(task.scope);
          folders.set(task.scope.name, folder);
        }
        const definition: GradleTaskDefinition = <GradleTaskDefinition>(
          task.definition
        );
        const relativePath = definition.path ? definition.path : '';
        const fullPath = path.join(task.scope.name, relativePath);
        buildGradle = gradleTasks.get(fullPath);
        if (!buildGradle) {
          buildGradle = new GradleTreeItem(
            folder,
            relativePath,
            definition.buildFile
          );
          folder.addGradleTreeItem(buildGradle);
          gradleTasks.set(fullPath, buildGradle);
        }
        const gradleTask = new GradleTaskItem(
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
