import * as vscode from "vscode";
import { TreeItemWithTasksOrGroups } from ".";

export class GroupTreeItem extends TreeItemWithTasksOrGroups {
    constructor(name: string, parentTreeItem: vscode.TreeItem, resourceUri?: vscode.Uri) {
        super(name, parentTreeItem, resourceUri, vscode.TreeItemCollapsibleState.Collapsed);
    }
}
