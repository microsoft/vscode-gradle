// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GradleTaskTreeItem } from ".";

export class PinnedTasksTreeItem extends vscode.TreeItem {
    private pinnedTasks: GradleTaskTreeItem[] = [];
    public readonly parentTreeItem?: vscode.TreeItem;
    public readonly iconPath = new vscode.ThemeIcon("star-full");
    public readonly contextValue = "folder";
    constructor(
        label: string,
        parentTreeItem?: vscode.TreeItem,
        resourceUri?: vscode.Uri,
        collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    ) {
        super(label, collapsibleState);
        this.resourceUri = resourceUri;
        this.parentTreeItem = parentTreeItem;
    }

    public setPinnedTaskItems(pinnedTasks: GradleTaskTreeItem[]): void {
        this.pinnedTasks = pinnedTasks;
    }

    public getPinnedTaskItems(): GradleTaskTreeItem[] {
        return this.pinnedTasks;
    }
}
