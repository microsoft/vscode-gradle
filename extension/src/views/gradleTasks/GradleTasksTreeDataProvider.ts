import * as vscode from "vscode";
import * as path from "path";
import {
    GradleTaskTreeItem,
    RootProjectTreeItem,
    ProjectTreeItem,
    GroupTreeItem,
    NoGradleTasksTreeItem,
    TreeItemWithTasksOrGroups,
} from "..";

import { GradleTaskDefinition, GradleTaskProvider } from "../../tasks";
import { isWorkspaceFolder } from "../../util";
import { cloneTask, isGradleTask } from "../../tasks/taskUtil";
import { PinnedTasksStore, RootProjectsStore } from "../../stores";
import { Icons } from "../../icons";
import { DependencyConfigurationTreeItem } from "./DependencyConfigurationTreeItem";
import { DependencyTreeItem } from "./DependencyTreeItem";
import { ProjectDependencyTreeItem } from "./ProjectDependencyTreeItem";
import { ProjectTaskTreeItem } from "./ProjectTaskTreeItem";
import { GradleDependencyProvider } from "../../dependencies/GradleDependencyProvider";
import { findRootProject } from "../../client/utils";
import { TaskArgs, TaskId } from "../../stores/types";
import { TaskServerClient } from "../../client";
import { buildPinnedTaskTreeItem } from "./utils";
import { PinnedTasksTreeItem } from "./PinnedTasksTreeItem";
import { PinnedTasksRootProjectTreeItem } from "./PinnedTasksRootProjectTreeItem";

const gradleTaskTreeItemMap: Map<string, GradleTaskTreeItem> = new Map();
const gradleProjectTreeItemMap: Map<string, RootProjectTreeItem> = new Map();
const projectTreeItemMap: Map<string, ProjectTreeItem> = new Map();
const groupTreeItemMap: Map<string, GroupTreeItem> = new Map();
const pinnedTaskTreeItemMap: Map<string, GradleTaskTreeItem> = new Map();

export function getGradleTaskTreeItemMap(): Map<string, GradleTaskTreeItem> {
    return gradleTaskTreeItemMap;
}

export function getProjectTreeItemMap(): Map<string, ProjectTreeItem> {
    return projectTreeItemMap;
}

export function getPinnedTaskTreeItemMap(): Map<string, GradleTaskTreeItem> {
    return pinnedTaskTreeItemMap;
}

function resetCachedTreeItems(): void {
    gradleTaskTreeItemMap.clear();
    gradleProjectTreeItemMap.clear();
    projectTreeItemMap.clear();
    groupTreeItemMap.clear();
    pinnedTaskTreeItemMap.clear();
}

export class GradleTasksTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private collapsed = true;
    private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> =
        new vscode.EventEmitter<vscode.TreeItem | null>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this._onDidChangeTreeData.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly rootProjectStore: RootProjectsStore,
        private readonly pinnedTasksStore: PinnedTasksStore,
        private readonly gradleTaskProvider: GradleTaskProvider,
        private readonly gradleDependencyProvider: GradleDependencyProvider,
        private readonly icons: Icons,
        private readonly client: TaskServerClient
    ) {
        const collapsed = this.context.workspaceState.get("gradleTasksCollapsed", false);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.setCollapsed(collapsed);
    }

    public async setCollapsed(collapsed: boolean): Promise<void> {
        this.collapsed = collapsed;
        await this.context.workspaceState.update("gradleTasksCollapsed", collapsed);
        await vscode.commands.executeCommand("setContext", "gradle:gradleTasksCollapsed", collapsed);
        this.refresh();
    }

    private async buildTreeItems(): Promise<vscode.TreeItem[]> {
        resetCachedTreeItems();
        // using vscode.tasks.fetchTasks({ type: 'gradle' }) is *incredibly slow* which
        // is why we get them directly from the task provider
        const tasks = await this.gradleTaskProvider.loadTasks();
        if (tasks.length === 0) {
            return [new NoGradleTasksTreeItem()];
        }
        const rootProjectTreeItems = GradleTasksTreeDataProvider.buildItemsTreeFromTasks(
            tasks,
            this.rootProjectStore,
            this.collapsed,
            this.icons
        );
        const pinnedTasksItem = new PinnedTasksTreeItem("Pinned Tasks");
        const pinnedTasks = this.pinnedTasksStore.getData();
        if (!pinnedTasks?.size) {
            return rootProjectTreeItems;
        }
        const pinnedTasksMap: Map<string, GradleTaskTreeItem[]> = new Map();
        Array.from(pinnedTasks.keys()).forEach((taskId: TaskId) => {
            const task = this.gradleTaskProvider.findByTaskId(taskId);
            if (!task) {
                return;
            }
            const definition = task.definition as GradleTaskDefinition;
            const rootProject = this.rootProjectStore.get(definition.projectFolder);
            if (!rootProject) {
                return;
            }
            let pinnedTasksArray = pinnedTasksMap.get(definition.projectFolder);
            if (!pinnedTasksArray) {
                pinnedTasksArray = [];
                pinnedTasksMap.set(definition.projectFolder, pinnedTasksArray);
            }
            const taskArgs = pinnedTasks.get(taskId) || "";
            if (taskArgs) {
                Array.from(taskArgs.values()).forEach((args: TaskArgs) => {
                    const pinnedTask = cloneTask(this.rootProjectStore, task, args, this.client, definition.javaDebug);
                    const gradleTaskTreeItem = buildPinnedTaskTreeItem(pinnedTasksItem, pinnedTask, this.icons);
                    pinnedTasksArray!.push(gradleTaskTreeItem);
                    pinnedTaskTreeItemMap.set(definition.id, gradleTaskTreeItem);
                });
            } else {
                const gradleTaskTreeItem = buildPinnedTaskTreeItem(pinnedTasksItem, task, this.icons);
                pinnedTasksArray.push(gradleTaskTreeItem);
                pinnedTaskTreeItemMap.set(definition.id, gradleTaskTreeItem);
            }
        });
        if (pinnedTasksMap.size) {
            if ((await this.rootProjectStore.getProjectRoots()).length === 1) {
                pinnedTasksItem.setChildren(pinnedTasksMap.values().next().value);
            } else {
                const pinnedTasksRootProjects: vscode.TreeItem[] = [];
                pinnedTasksMap.forEach((value, key) => {
                    const rootProject = this.rootProjectStore.get(key);
                    if (rootProject) {
                        const pinnedTasksRootProjectTreeItem = new PinnedTasksRootProjectTreeItem(
                            path.basename(key),
                            rootProject.getProjectUri()
                        );
                        pinnedTasksRootProjectTreeItem.setChildren(value);
                        pinnedTasksRootProjects.push(pinnedTasksRootProjectTreeItem);
                    }
                });
                pinnedTasksItem.setChildren(pinnedTasksRootProjects);
            }
            return [pinnedTasksItem, ...rootProjectTreeItems];
        } else {
            return rootProjectTreeItems;
        }
    }

    public refresh(treeItem: vscode.TreeItem | null = null): void {
        this._onDidChangeTreeData.fire(treeItem);
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public getParent(element: vscode.TreeItem): vscode.TreeItem | null {
        if (
            element instanceof RootProjectTreeItem ||
            element instanceof ProjectTreeItem ||
            element instanceof TreeItemWithTasksOrGroups ||
            element instanceof GradleTaskTreeItem ||
            element instanceof ProjectTreeItem ||
            element instanceof DependencyConfigurationTreeItem ||
            element instanceof DependencyTreeItem
        ) {
            return element.parentTreeItem || null;
        }
        return null;
    }

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element instanceof RootProjectTreeItem) {
            return element.projects;
        }
        if (element instanceof ProjectTreeItem) {
            return this.getChildrenForProjectTreeItem(element);
        }
        if (element instanceof GroupTreeItem) {
            return element.tasks;
        }
        if (element instanceof GradleTaskTreeItem || element instanceof NoGradleTasksTreeItem) {
            return [];
        }
        if (element instanceof ProjectDependencyTreeItem) {
            const rootProject = await findRootProject(this.rootProjectStore, element.projectPath);
            if (!rootProject) {
                return GradleDependencyProvider.getNoDependencies();
            }
            return this.gradleDependencyProvider.getDependencies(element, rootProject);
        }
        if (
            element instanceof ProjectTaskTreeItem ||
            element instanceof DependencyConfigurationTreeItem ||
            element instanceof DependencyTreeItem
        ) {
            return element.getChildren() || [];
        }
        if (element instanceof PinnedTasksTreeItem || element instanceof PinnedTasksRootProjectTreeItem) {
            return element.getChildren();
        }
        if (!element) {
            return this.buildTreeItems();
        }
        return [];
    }

    public async getChildrenForProjectTreeItem(element: ProjectTreeItem): Promise<vscode.TreeItem[]> {
        const projectTaskItem = new ProjectTaskTreeItem("Tasks", vscode.TreeItemCollapsibleState.Collapsed, element);
        projectTaskItem.setChildren([...element.groups, ...element.tasks]);
        const results: vscode.TreeItem[] = [projectTaskItem];
        const resourceUri = element.resourceUri;
        if (!resourceUri) {
            return results;
        }
        const projectDependencyTreeItem: ProjectDependencyTreeItem = new ProjectDependencyTreeItem(
            "Dependencies",
            vscode.TreeItemCollapsibleState.Collapsed,
            element,
            path.dirname(resourceUri.fsPath),
            typeof element.label === "string" ? element.label : resourceUri.fsPath
        );
        return [...results, projectDependencyTreeItem];
    }

    public static buildItemsTreeFromTasks(
        tasks: vscode.Task[],
        rootProjectStore: RootProjectsStore,
        collapsed: boolean,
        icons: Icons
    ): RootProjectTreeItem[] | NoGradleTasksTreeItem[] {
        let gradleProjectTreeItem = null;

        tasks.forEach((task) => {
            const definition = task.definition as GradleTaskDefinition;
            if (isWorkspaceFolder(task.scope) && isGradleTask(task)) {
                const rootProject = rootProjectStore.get(definition.projectFolder);
                if (!rootProject) {
                    return;
                }
                gradleProjectTreeItem = gradleProjectTreeItemMap.get(definition.projectFolder);
                if (!gradleProjectTreeItem) {
                    gradleProjectTreeItem = new RootProjectTreeItem(
                        path.basename(definition.projectFolder),
                        rootProject.getProjectUri()
                    );
                    gradleProjectTreeItemMap.set(definition.projectFolder, gradleProjectTreeItem);
                }

                let projectTreeItem = projectTreeItemMap.get(definition.buildFile);
                if (!projectTreeItem) {
                    projectTreeItem = new ProjectTreeItem(
                        definition.project,
                        gradleProjectTreeItem,
                        vscode.Uri.file(definition.buildFile)
                    );
                    gradleProjectTreeItem.addProject(projectTreeItem);
                    projectTreeItemMap.set(definition.buildFile, projectTreeItem);
                }

                const taskName = definition.script.slice(definition.script.lastIndexOf(":") + 1);
                let parentTreeItem: ProjectTreeItem | GroupTreeItem = projectTreeItem;

                if (!collapsed) {
                    const groupId = definition.group + definition.project + definition.projectFolder;
                    let groupTreeItem = groupTreeItemMap.get(groupId);
                    if (!groupTreeItem) {
                        groupTreeItem = new GroupTreeItem(definition.group, projectTreeItem, undefined);
                        projectTreeItem.addGroup(groupTreeItem);
                        groupTreeItemMap.set(groupId, groupTreeItem);
                    }
                    parentTreeItem = groupTreeItem;
                }

                const taskTreeItem = new GradleTaskTreeItem(
                    parentTreeItem,
                    task,
                    taskName,
                    definition.description || taskName,
                    "",
                    icons,
                    definition.debuggable
                );
                taskTreeItem.setContext();

                gradleTaskTreeItemMap.set(task.definition.id, taskTreeItem);
                parentTreeItem.addTask(taskTreeItem);
            }
        });

        if (gradleProjectTreeItemMap.size === 1) {
            return gradleProjectTreeItemMap.values().next().value.projects;
        }
        return [...gradleProjectTreeItemMap.values()];
    }
}
