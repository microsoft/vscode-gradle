// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export class ProjectDependencyTreeItem extends vscode.TreeItem {
    private children: vscode.TreeItem[] | undefined;
    constructor(
        name: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parentTreeItem: vscode.TreeItem,
        readonly projectPath: string,
        readonly projectName: string,
        iconPath: vscode.ThemeIcon = new vscode.ThemeIcon("folder-library")
    ) {
        super(name, collapsibleState);
        this.iconPath = iconPath;
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
}
