// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GradleTasksTreeDataProvider, GroupTreeItem, ProjectTreeItem } from "..";
import { GradleClient } from "../../client";
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
        private readonly client: GradleClient,
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
            return GradleTasksTreeDataProvider.getChildrenForProjectTreeItem(element);
        } else if (element instanceof ProjectDependencyTreeItem) {
            return this.defaultProjectProvider.getDefaultDependencyItems(element);
        } else if (element instanceof ProjectTaskTreeItem) {
            return element.getChildren() || [];
        } else if (element instanceof GroupTreeItem) {
            return element.tasks;
        }
        return [];
    }
}
