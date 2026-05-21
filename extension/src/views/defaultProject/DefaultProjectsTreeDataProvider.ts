// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as path from "path";
import { GradleTasksTreeDataProvider, GroupTreeItem, ProjectTreeItem } from "..";
import { TaskServerClient } from "../../client";
import { findRootProject } from "../../client/utils";
import { GradleDependencyProvider } from "../../dependencies/GradleDependencyProvider";
import { RootProjectsStore } from "../../stores";
import { GradleTaskProvider } from "../../tasks";
import { DefaultProjectProvider } from "./DefaultProjectProvider";
import { Icons } from "../../icons";
import { ProjectDependencyTreeItem } from "../gradleTasks/ProjectDependencyTreeItem";
import { ProjectTaskTreeItem } from "../gradleTasks/ProjectTaskTreeItem";

export class DefaultProjectsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private defaultProjectProvider: DefaultProjectProvider;
    private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> =
        new vscode.EventEmitter<vscode.TreeItem | null>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this._onDidChangeTreeData.event;

    constructor(
        private readonly gradleTaskProvider: GradleTaskProvider,
        private readonly rootProjectStore: RootProjectsStore,
        private readonly client: TaskServerClient,
        private readonly icons: Icons,
        private readonly gradleDependencyProvider: GradleDependencyProvider
    ) {
        this.defaultProjectProvider = new DefaultProjectProvider();
    }

    public refresh(treeItem: vscode.TreeItem | null = null): void {
        this._onDidChangeTreeData.fire(treeItem);
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            // async configuring
            void this.gradleTaskProvider.loadTasks();
            return GradleTasksTreeDataProvider.buildItemsTreeFromTasks(
                await this.defaultProjectProvider.getDefaultTasks(
                    await this.rootProjectStore.getProjectRoots(),
                    this.client
                ),
                this.rootProjectStore,
                false,
                this.icons
            );
        } else if (element instanceof ProjectTreeItem) {
            return this.getChildrenForProjectTreeItem(element);
        } else if (element instanceof ProjectDependencyTreeItem) {
            const rootProject = await findRootProject(this.rootProjectStore, element.projectPath);
            if (!rootProject) {
                return GradleDependencyProvider.getNoDependencies();
            }
            return this.gradleDependencyProvider.getDependencies(element, rootProject);
        } else if (element instanceof ProjectTaskTreeItem) {
            return element.getChildren() || [];
        } else if (element instanceof GroupTreeItem) {
            return element.tasks;
        }
        return [];
    }

    private async getChildrenForProjectTreeItem(element: ProjectTreeItem): Promise<vscode.TreeItem[]> {
        const projectTaskItem = new ProjectTaskTreeItem("Tasks", vscode.TreeItemCollapsibleState.Collapsed, element);
        projectTaskItem.setChildren([...element.tasks, ...element.groups]);
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
            typeof element.label === "string" ? element.label : resourceUri.fsPath,
            element.gradleProjectPath
        );
        return [projectDependencyTreeItem, ...results];
    }
}
