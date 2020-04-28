import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import {
  isWorkspaceFolder,
  isTaskCancelling,
  isTaskRunning,
  isGradleTask,
  GradleTaskDefinition,
} from './tasks';
import {
  getConfigFocusTaskInExplorer,
  JavaDebug,
  getConfigJavaDebug,
  getConfigIsTasksExplorerEnabled,
} from './config';
import { logger } from './logger';

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
    resourceUri?: vscode.Uri,
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
    resourceUri?: vscode.Uri
  ) {
    super(
      name,
      parentTreeItem,
      resourceUri,
      vscode.TreeItemCollapsibleState.Collapsed
    );
  }
}

function getTreeItemState(task: vscode.Task, javaDebug?: JavaDebug): string {
  if (isTaskRunning(task)) {
    return GradleTaskTreeItem.STATE_RUNNING;
  }
  if (isTaskCancelling(task)) {
    return GradleTaskTreeItem.STATE_CANCELLING;
  }
  return javaDebug && javaDebug.tasks.includes(task.definition.script)
    ? GradleTaskTreeItem.STATE_DEBUG_IDLE
    : GradleTaskTreeItem.STATE_IDLE;
}

type IconPath = { light: string | vscode.Uri; dark: string | vscode.Uri };

export class GradleTaskTreeItem extends vscode.TreeItem {
  public readonly task: vscode.Task;
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly execution?: vscode.TaskExecution;

  private readonly iconPathRunning?: IconPath;
  private readonly iconPathIdle?: IconPath;
  private readonly javaDebug?: JavaDebug;

  public static STATE_RUNNING = 'runningTask';
  public static STATE_CANCELLING = 'cancellingTask';
  public static STATE_IDLE = 'task';
  public static STATE_DEBUG_IDLE = 'debugTask';

  constructor(
    parentTreeItem: vscode.TreeItem,
    task: vscode.Task,
    label: string,
    description: string,
    iconPathRunning: IconPath,
    iconPathIdle: IconPath,
    javaDebug?: JavaDebug
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: localize('gradleView.runTask', 'Run Task'),
      command: 'gradle.openBuildFile',
      arguments: [this],
    };
    this.tooltip = description || label;
    this.parentTreeItem = parentTreeItem;
    this.task = task;
    this.javaDebug = javaDebug;
    this.iconPathRunning = iconPathRunning;
    this.iconPathIdle = iconPathIdle;
    this.setContext();
  }

  setContext(): void {
    this.contextValue = getTreeItemState(this.task, this.javaDebug);
    if (this.contextValue === GradleTaskTreeItem.STATE_RUNNING) {
      this.iconPath = this.iconPathRunning;
    } else {
      this.iconPath = this.iconPathIdle;
    }
  }
}

class NoTasksTreeItem extends vscode.TreeItem {
  constructor(context: vscode.ExtensionContext) {
    super(
      localize('gradleView.noTasksFound', 'No tasks found'),
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'notasks';
    this.command = {
      title: localize('gradleView.showLogs', 'Show Logs'),
      command: 'gradle.showLogs',
    };
    this.iconPath = {
      light: context.asAbsolutePath(
        path.join('resources', 'light', 'issues.svg')
      ),
      dark: context.asAbsolutePath(
        path.join('resources', 'dark', 'issues.svg')
      ),
    };
  }
}

const taskTreeItemMap: Map<string, GradleTaskTreeItem> = new Map();

export class GradleTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private collapsed = true;
  private taskItems: vscode.Task[] = [];
  private treeItems: WorkspaceTreeItem[] | NoTasksTreeItem[] | null = null;
  private iconPathRunning?: IconPath;
  private iconPathIdle?: IconPath;
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.iconPathRunning = {
      light: this.context.asAbsolutePath(
        path.join('resources', 'light', 'loading.svg')
      ),
      dark: this.context.asAbsolutePath(
        path.join('resources', 'dark', 'loading.svg')
      ),
    };
    this.iconPathIdle = {
      light: this.context.asAbsolutePath(
        path.join('resources', 'light', 'script.svg')
      ),
      dark: this.context.asAbsolutePath(
        path.join('resources', 'dark', 'script.svg')
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
    this.render();
  }

  async refresh(): Promise<void> {
    this.buildTreeItems();
    this.render();
  }

  buildTreeItems(): void {
    taskTreeItemMap.clear();
    if (this.taskItems.length === 0) {
      this.treeItems = [new NoTasksTreeItem(this.context)];
    } else {
      this.treeItems = this.buildItemsTreeFromTasks(this.taskItems);
    }
  }

  setTaskItems(tasks: vscode.Task[]): void {
    this.taskItems = tasks;
  }

  renderTask(task: vscode.Task): void {
    const treeItem = taskTreeItemMap.get(task.definition.id);
    treeItem?.setContext();
    this.render();
  }

  render(): void {
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

  getFlattenedTaskTree(treeItems: vscode.TreeItem[]): GradleTaskTreeItem[] {
    return treeItems
      .map((element: vscode.TreeItem) => {
        if (element instanceof GradleTaskTreeItem) {
          return element;
        }
        return this.getFlattenedTaskTree(this.getChildren(element));
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

  findProjectTreeItem(uri: vscode.Uri): ProjectTreeItem | undefined {
    if (this.treeItems) {
      return this.treeItems.find((element: vscode.TreeItem) => {
        return (
          element instanceof ProjectTreeItem &&
          element.resourceUri?.fsPath === uri.fsPath
        );
      }) as ProjectTreeItem | undefined;
    }
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

async function focusTaskInTree(
  treeView: vscode.TreeView<vscode.TreeItem>,
  task: vscode.Task
): Promise<void> {
  try {
    const treeItem = taskTreeItemMap.get(task.definition.id);
    if (treeItem) {
      await treeView.reveal(treeItem, {
        focus: true,
        expand: true,
      });
    }
  } catch (err) {
    logger.error(
      localize(
        'gradleView.focusTaskError',
        'Unable to focus task in explorer: {0}',
        err.message
      )
    );
  }
}

export function registerExplorer(
  context: vscode.ExtensionContext
): {
  treeDataProvider: GradleTasksTreeDataProvider;
  treeView: vscode.TreeView<vscode.TreeItem>;
} {
  const collapsed = context.workspaceState.get('explorerCollapsed', false);
  const treeDataProvider = new GradleTasksTreeDataProvider(context);
  treeDataProvider.setCollapsed(collapsed);
  const treeView = vscode.window.createTreeView('gradleTreeView', {
    treeDataProvider: treeDataProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(
    treeView,
    vscode.workspace.onDidChangeConfiguration(
      (event: vscode.ConfigurationChangeEvent) => {
        if (event.affectsConfiguration('gradle.enableTasksExplorer')) {
          vscode.commands.executeCommand(
            'setContext',
            'gradle:showTasksExplorer',
            getConfigIsTasksExplorerEnabled()
          );
        } else if (
          event.affectsConfiguration('gradle.javaDebug') ||
          event.affectsConfiguration('gradle.taskPresentationOptions')
        ) {
          vscode.commands.executeCommand('gradle.refresh');
        }
      }
    ),
    vscode.tasks.onDidStartTask(async (event: vscode.TaskStartEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        treeDataProvider.renderTask(task);
        if (treeView.visible && getConfigFocusTaskInExplorer()) {
          await focusTaskInTree(treeView, task);
        }
      }
    }),
    vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        treeDataProvider.renderTask(task);
      }
    })
  );
  return { treeDataProvider, treeView };
}
