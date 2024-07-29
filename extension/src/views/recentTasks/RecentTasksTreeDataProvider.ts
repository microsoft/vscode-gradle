import * as vscode from "vscode";
import * as path from "path";
import { RecentTaskTreeItem, NoRecentTasksTreeItem, RecentTasksRootProjectTreeItem } from ".";
import { TaskTerminalsStore, RecentTasksStore, RootProjectsStore } from "../../stores";
import { GradleTaskDefinition, GradleTaskProvider } from "../../tasks";
import { GradleTaskTreeItem } from "..";
import { isWorkspaceFolder } from "../../util";
import { TaskId, TaskArgs } from "../../stores/types";
import { cloneTask, isGradleTask } from "../../tasks/taskUtil";
import { TaskServerClient } from "../../client";
import { Icons } from "../../icons";

const recentTasksGradleProjectTreeItemMap: Map<string, RecentTasksRootProjectTreeItem> = new Map();

const recentTasksTreeItemMap: Map<string, RecentTaskTreeItem> = new Map();

export function getRecentTaskTreeItemMap(): Map<string, RecentTaskTreeItem> {
    return recentTasksTreeItemMap;
}

function buildTaskTreeItem(
    gradleProjectTreeItem: RecentTasksRootProjectTreeItem,
    task: vscode.Task,
    taskTerminalsStore: TaskTerminalsStore,
    icons: Icons
): RecentTaskTreeItem {
    const definition = task.definition as GradleTaskDefinition;
    const taskName = task.name;
    const recentTaskTreeItem = new RecentTaskTreeItem(
        gradleProjectTreeItem,
        task,
        taskName,
        definition.description || taskName, // used for tooltip
        icons,
        taskTerminalsStore,
        definition.debuggable
    );
    recentTaskTreeItem.setContext();
    return recentTaskTreeItem;
}

function buildGradleProjectTreeItem(task: vscode.Task, taskTerminalsStore: TaskTerminalsStore, icons: Icons): void {
    const definition = task.definition as GradleTaskDefinition;
    if (isWorkspaceFolder(task.scope) && isGradleTask(task)) {
        let gradleProjectTreeItem = recentTasksGradleProjectTreeItemMap.get(definition.projectFolder);
        if (!gradleProjectTreeItem) {
            gradleProjectTreeItem = new RecentTasksRootProjectTreeItem(path.basename(definition.projectFolder));
            recentTasksGradleProjectTreeItemMap.set(definition.projectFolder, gradleProjectTreeItem);
        }

        const recentTaskTreeItem = buildTaskTreeItem(gradleProjectTreeItem, task, taskTerminalsStore, icons);
        recentTasksTreeItemMap.set(definition.id + definition.args, recentTaskTreeItem);

        gradleProjectTreeItem.addTask(recentTaskTreeItem);
    }
}

export class RecentTasksTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> =
        new vscode.EventEmitter<vscode.TreeItem | null>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this._onDidChangeTreeData.event;

    constructor(
        private readonly recentTasksStore: RecentTasksStore,
        private readonly taskTerminalsStore: TaskTerminalsStore,
        private readonly rootProjectsStore: RootProjectsStore,
        private readonly gradleTaskProvider: GradleTaskProvider,
        private readonly client: TaskServerClient,
        private readonly icons: Icons
    ) {
        this.recentTasksStore.onDidChange(() => this.refresh());
        this.taskTerminalsStore.onDidChange(this.handleTerminalsStoreChange);
    }

    private handleTerminalsStoreChange = (terminals: Set<vscode.Terminal> | null): void => {
        if (terminals) {
            const taskId = Array.from(this.taskTerminalsStore.getData().keys()).find(
                (key) => this.taskTerminalsStore.getItem(key) === terminals
            );
            if (taskId) {
                const treeItem = recentTasksTreeItemMap.get(taskId);
                if (treeItem) {
                    treeItem.setContext();
                    this.refresh(treeItem);
                    return;
                }
            }
        }
        this.refresh();
    };

    public getStore(): RecentTasksStore {
        return this.recentTasksStore;
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public refresh(treeItem: vscode.TreeItem | null = null): void {
        this._onDidChangeTreeData.fire(treeItem);
    }

    public getParent(element: vscode.TreeItem): vscode.TreeItem | null {
        if (element instanceof GradleTaskTreeItem) {
            return element.parentTreeItem || null;
        }
        return null;
    }

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element instanceof RecentTasksRootProjectTreeItem) {
            return [...element.tasks];
        }
        if (!element) {
            const treeItems = await this.buildTreeItems();
            if (!treeItems.length) {
                return [new NoRecentTasksTreeItem()];
            } else {
                return treeItems;
            }
        }
        return [];
    }

    private async buildTreeItems(): Promise<vscode.TreeItem[]> {
        recentTasksGradleProjectTreeItemMap.clear();
        recentTasksTreeItemMap.clear();

        const gradleProjects = await this.rootProjectsStore.getProjectRoots();
        if (!gradleProjects.length) {
            return [];
        }
        const isMultiRoot = gradleProjects.length > 1;
        await this.gradleTaskProvider.waitForTasksLoad();

        const recentTasks = this.recentTasksStore.getData();
        Array.from(recentTasks.keys()).forEach((taskId: TaskId) => {
            const task = this.gradleTaskProvider.findByTaskId(taskId);
            if (!task) {
                return;
            }
            const definition = task.definition as GradleTaskDefinition;
            const rootProject = this.rootProjectsStore.get(definition.projectFolder);
            if (!rootProject) {
                return;
            }
            const taskArgs = recentTasks.get(taskId) || "";
            if (taskArgs) {
                Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
                    const recentTask = cloneTask(
                        this.rootProjectsStore,
                        task,
                        args,
                        this.client,
                        definition.debuggable
                    );
                    buildGradleProjectTreeItem(recentTask, this.taskTerminalsStore, this.icons);
                });
            }
        });

        if (!recentTasksGradleProjectTreeItemMap.size) {
            return [];
        } else if (isMultiRoot) {
            return [...recentTasksGradleProjectTreeItemMap.values()];
        } else {
            return [...recentTasksGradleProjectTreeItemMap.values().next().value.tasks];
        }
    }
}
