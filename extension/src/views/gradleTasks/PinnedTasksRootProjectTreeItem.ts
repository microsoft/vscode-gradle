// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { TREE_ITEM_STATE_FOLDER } from "../constants";

export class PinnedTasksRootProjectTreeItem extends vscode.TreeItem {
    private children: vscode.TreeItem[] = [];

    constructor(name: string, resourceUri: vscode.Uri) {
        super(name, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = TREE_ITEM_STATE_FOLDER;
        this.resourceUri = resourceUri;
        this.iconPath = vscode.ThemeIcon.Folder;
    }

    public setChildren(children: vscode.TreeItem[]): void {
        this.children = children;
    }

    public getChildren(): vscode.TreeItem[] {
        return this.children;
    }
}
