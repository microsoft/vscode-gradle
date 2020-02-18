import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import { isWorkspaceFolder, isTaskStopping, isTaskRunning } from './tasks';

const localize = nls.loadMessageBundle();

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

function getTreeItemState(task: vscode.Task): string {
  if (isTaskRunning(task)) {
    return GradleTaskTreeItem.STATE_RUNNING;
  }
  if (isTaskStopping(task)) {
    return GradleTaskTreeItem.STATE_STOPPING;
  }
  return GradleTaskTreeItem.STATE_IDLE;
}

export class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly execution: vscode.TaskExecution | undefined;

  public static STATE_RUNNING = 'runningTask';
  public static STATE_STOPPING = 'stoppingTask';
  public static STATE_IDLE = 'task';

  constructor(
    context: vscode.ExtensionContext,
    parentTreeItem: vscode.TreeItem,
    task: vscode.Task,
    label: string,
    description?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: localize('gradleView.runTask', 'Run Task'),
      command: 'gradle.openBuildFile',
      arguments: [this]
    };
    this.tooltip = description || label;
    this.parentTreeItem = parentTreeItem;
    this.task = task;
    this.contextValue = getTreeItemState(task);

    if (this.contextValue === GradleTaskTreeItem.STATE_RUNNING) {
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
    super(
      localize('gradleView.runTask', 'No tasks found'),
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'notasks';
  }
}

export class GradleTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private collapsed = true;
  private taskItems: vscode.Task[] = [];
  private treeItems: WorkspaceTreeItem[] | NoTasksTreeItem[] | null = null;

  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(private readonly extensionContext: vscode.ExtensionContext) {}

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

  async refresh(): Promise<void> {
    this.taskItems = await vscode.tasks.fetchTasks({ type: 'gradle' });
    this.render();
  }

  render(): void {
    if (this.taskItems.length === 0) {
      this.treeItems = [new NoTasksTreeItem()];
    } else {
      this.treeItems = this.buildItemsTreeFromTasks(this.taskItems);
    }
    this._onDidChangeTreeData.fire();
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

  getFlattenedTree(treeItems: vscode.TreeItem[]): GradleTaskTreeItem[] {
    return treeItems
      .map((element: vscode.TreeItem) => {
        if (element instanceof GradleTaskTreeItem) {
          return element;
        }
        return this.getFlattenedTree(this.getChildren(element));
      })
      .flat() as GradleTaskTreeItem[];
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
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
    if (!element && this.treeItems) {
      return this.treeItems;
    }
    return [];
  }

  findTreeItem(task: vscode.Task): GradleTaskTreeItem | void {
    if (this.treeItems) {
      const tree = this.getFlattenedTree(this.treeItems);
      return tree.find(
        treeItem =>
          JSON.stringify(treeItem.task.definition) ===
          JSON.stringify(task.definition)
      );
    }
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  buildItemsTreeFromTasks(
    tasks: vscode.Task[]
  ): WorkspaceTreeItem[] | NoTasksTreeItem[] {
    const workspaceTreeItems: Map<string, WorkspaceTreeItem> = new Map();
    const nestedWorkspaceTreeItems: Map<string, WorkspaceTreeItem> = new Map();
    const projectTreeItems: Map<string, ProjectTreeItem> = new Map();
    const groupTreeItems: Map<string, GroupTreeItem> = new Map();
    let workspaceTreeItem = null;

    tasks.forEach(task => {
      if (isWorkspaceFolder(task.scope) && task.definition.buildFile) {
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

export function registerExplorer(
  context: vscode.ExtensionContext
): GradleTasksTreeDataProvider {
  const collapsed = context.workspaceState.get('explorerCollapsed', false);
  const treeDataProvider = new GradleTasksTreeDataProvider(context);
  treeDataProvider.setCollapsed(collapsed);
  const treeView = vscode.window.createTreeView('gradleTreeView', {
    treeDataProvider: treeDataProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(
    treeView,
    vscode.workspace.onDidChangeConfiguration(
      (event: vscode.ConfigurationChangeEvent) => {
        if (event.affectsConfiguration('gradle.enableTasksExplorer')) {
          vscode.commands.executeCommand('gradle.refresh', false, false);
        }
      }
    ),
    vscode.tasks.onDidStartTask((event: vscode.TaskStartEvent) => {
      const { type } = event.execution.task.definition;
      if (type === 'gradle') {
        const treeItem = treeDataProvider.findTreeItem(event.execution.task);
        if (treeItem) {
          treeView.reveal(treeItem, {
            focus: true,
            expand: true
          });
        }
      }
      treeDataProvider.render();
    }),
    vscode.tasks.onDidEndTask(() => {
      treeDataProvider.render();
    })
  );
  return treeDataProvider;
}
