// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { TREE_ITEM_STATE_DEPENDENCIES, TREE_ITEM_STATE_DEPENDENCIES_LOADING } from "../constants";

export class ProjectDependencyTreeItem extends vscode.TreeItem {
    private children: vscode.TreeItem[] | undefined;
    private readonly defaultIconPath: vscode.ThemeIcon;
    constructor(
        name: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parentTreeItem: vscode.TreeItem,
        readonly projectPath: string,
        readonly projectName: string,
        readonly gradleProjectPath: string,
        iconPath: vscode.ThemeIcon = new vscode.ThemeIcon("folder-library")
    ) {
        super(name, collapsibleState);
        this.defaultIconPath = iconPath;
        this.iconPath = iconPath;
        this.contextValue = TREE_ITEM_STATE_DEPENDENCIES;
    }

    public setLoading(loading: boolean): void {
        this.contextValue = loading ? TREE_ITEM_STATE_DEPENDENCIES_LOADING : TREE_ITEM_STATE_DEPENDENCIES;
        this.iconPath = loading ? new vscode.ThemeIcon("loading~spin") : this.defaultIconPath;
    }

    public setChildren(children: vscode.TreeItem[]): void {
        this.children = children;
    }

    public getChildren(): vscode.TreeItem[] | undefined {
        return this.children;
    }

    public getProjectPath(): string {
        return this.projectPath;
    }

    public getProjectName(): string {
        return this.projectName;
    }

    public getGradleProjectPath(): string {
        return this.gradleProjectPath;
    }
}
