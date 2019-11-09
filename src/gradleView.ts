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
  tasks
} from 'vscode';

import {
  GradleTaskDefinition,
  isWorkspaceFolder,
  invalidateTasksCache,
  enableTaskDetection
} from './tasks';

import { getHasExplorerNestedSubProjects } from './config';

class WorkspaceTreeItem extends TreeItem {
  buildFileTreeItems: GradleBuildFileTreeItem[] = [];
  workspaceFolder: WorkspaceFolder;

  constructor(name: string, folder: WorkspaceFolder) {
    super(name, TreeItemCollapsibleState.Expanded);
    this.contextValue = 'folder';
    this.resourceUri = folder.uri;
    this.workspaceFolder = folder;
    this.iconPath = ThemeIcon.Folder;
  }

  addGradleBuildFileTreeItem(buildGradle: GradleBuildFileTreeItem) {
    this.buildFileTreeItems.push(buildGradle);
  }
}

class GradleTasksFolderTreeItem extends TreeItem {
  tasks: GradleTaskTreeItem[] = [];
  workspaceTreeItem: WorkspaceTreeItem;
  path: string;

  constructor(
    workspaceTreeItem: WorkspaceTreeItem,
    relativePath: string,
    name: string
  ) {
    super(name, TreeItemCollapsibleState.Expanded);
    this.workspaceTreeItem = workspaceTreeItem;
    this.path = relativePath;
    this.contextValue = name;
  }

  addTask(task: GradleTaskTreeItem) {
    this.tasks.push(task);
  }
}

class GradleBuildFileTreeItem extends GradleTasksFolderTreeItem {
  subProjects: SubProjectTreeItem[] = [];

  static getLabel(
    _folderName: string,
    relativePath: string,
    name: string
  ): string {
    if (relativePath.length > 0) {
      return path.join(relativePath, name);
    }
    return name;
  }

  constructor(folder: WorkspaceTreeItem, relativePath: string, name: string) {
    super(
      folder,
      relativePath,
      GradleBuildFileTreeItem.getLabel(folder.label!, relativePath, name)
    );
    if (relativePath) {
      this.resourceUri = Uri.file(
        path.join(folder!.resourceUri!.fsPath, relativePath, name)
      );
    } else {
      this.resourceUri = Uri.file(path.join(folder!.resourceUri!.fsPath, name));
    }
    this.iconPath = ThemeIcon.File;
  }

  addSubProjectTreeItem(subProject: SubProjectTreeItem) {
    this.subProjects.push(subProject);
  }
}

class SubProjectTreeItem extends WorkspaceTreeItem {}

type ExplorerCommands = 'run';

class GradleTaskTreeItem extends TreeItem {
  task: Task;
  folderTreeItem: GradleTasksFolderTreeItem;

  constructor(
    context: ExtensionContext,
    folderTreeItem: GradleTasksFolderTreeItem,
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
    this.folderTreeItem = folderTreeItem;
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
    return this.folderTreeItem.workspaceTreeItem.workspaceFolder;
  }
}

class NoTasksTreeItem extends TreeItem {
  constructor() {
    super('No tasks found', TreeItemCollapsibleState.None);
    this.contextValue = 'notasks';
  }
}

export class GradleTasksTreeDataProvider implements TreeDataProvider<TreeItem> {
  private taskItemsPromise: Thenable<Task[]> | undefined = undefined;
  private taskTree:
    | WorkspaceTreeItem[]
    | GradleBuildFileTreeItem[]
    | NoTasksTreeItem[]
    | null = null;
  private _onDidChangeTreeData: EventEmitter<TreeItem | null> = new EventEmitter<TreeItem | null>();
  readonly onDidChangeTreeData: Event<TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(private readonly extensionContext: ExtensionContext) {}

  runTask(taskItem: GradleTaskTreeItem) {
    if (taskItem && taskItem.task) {
      tasks.executeTask(taskItem.task);
    }
  }

  refresh() {
    invalidateTasksCache();
    enableTaskDetection();
    this.taskTree = null;
    this.taskItemsPromise = tasks
      .fetchTasks({ type: 'gradle' })
      .then((tasks = []) => tasks.filter(task => task.source === 'gradle'));
    this._onDidChangeTreeData.fire();
    return this.taskItemsPromise;
  }

  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  getParent(element: TreeItem): TreeItem | null {
    if (element instanceof WorkspaceTreeItem) {
      return null;
    }
    if (element instanceof GradleTasksFolderTreeItem) {
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

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
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
    tasks: Task[]
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
            task.scope
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
            definition.buildFile
          );
          workspaceTreeItem.addGradleBuildFileTreeItem(buildFileTreeItem);
          buildFileTreeItems.set(fullPath, buildFileTreeItem);
        }
        if (showNestedSubProjects && definition.subProjectBuildFile) {
          const [subProjectName] = task.definition.task.split(':');
          let subProjectTreeItem = subProjectTreeItems.get(subProjectName);
          if (!subProjectTreeItem) {
            subProjectTreeItem = new SubProjectTreeItem(
              subProjectName,
              task.scope
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
              workspaceTreeItem,
              relativePath,
              path.basename(definition.subProjectBuildFile)
            );
            subProjectTreeItem.addGradleBuildFileTreeItem(
              subProjectBuildFileTreeItem
            );
            subProjectBuildFileTreeItems.set(
              subProjectPath,
              subProjectBuildFileTreeItem
            );
          }
          task.name = task.name.replace(/[^:]+:/, '');
          const gradleTask = new GradleTaskTreeItem(
            this.extensionContext,
            subProjectBuildFileTreeItem,
            task
          );
          subProjectBuildFileTreeItem.addTask(gradleTask);
        } else {
          const gradleTask = new GradleTaskTreeItem(
            this.extensionContext,
            buildFileTreeItem,
            task
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
