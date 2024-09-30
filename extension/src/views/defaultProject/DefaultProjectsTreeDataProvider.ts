// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as path from "path";
import { GradleTasksTreeDataProvider, GroupTreeItem, ProjectTreeItem } from "..";
import { TaskServerClient } from "../../client";
import { RootProjectsStore } from "../../stores";
import { GradleTaskProvider } from "../../tasks";
import { DefaultProjectProvider } from "./DefaultProjectProvider";
import { Icons } from "../../icons";
import { ProjectDependencyTreeItem } from "../gradleTasks/ProjectDependencyTreeItem";
import { ProjectTaskTreeItem } from "../gradleTasks/ProjectTaskTreeItem";

export class DefaultProjectsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private defaultProjectProvider: DefaultProjectProvider;

    constructor(
        private readonly gradleTaskProvider: GradleTaskProvider,
        private readonly rootProjectStore: RootProjectsStore,
        private readonly client: TaskServerClient,
        private readonly icons: Icons
    ) {
        this.defaultProjectProvider = new DefaultProjectProvider();
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
            return this.defaultProjectProvider.getDefaultDependencyItems(element);
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
            typeof element.label === "string" ? element.label : resourceUri.fsPath
        );
        return [projectDependencyTreeItem, ...results];
    }
}
