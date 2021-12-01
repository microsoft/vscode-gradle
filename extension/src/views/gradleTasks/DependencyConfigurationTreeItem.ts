// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export class DependencyConfigurationTreeItem extends vscode.TreeItem {
    private children: vscode.TreeItem[];
    constructor(
        name: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parentTreeItem: vscode.TreeItem,
        iconPath: vscode.ThemeIcon = new vscode.ThemeIcon("folder-library")
    ) {
        super(name, collapsibleState);
        this.iconPath = iconPath;
        this.children = [];
    }

    public setChildren(children: vscode.TreeItem[]): void {
        this.children = children;
    }

    public getChildren(): vscode.TreeItem[] {
        return this.children;
    }
}
