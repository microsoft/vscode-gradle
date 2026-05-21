import * as vscode from "vscode";
import { TreeItemWithTasksOrGroups } from ".";

export class ProjectTreeItem extends TreeItemWithTasksOrGroups {
    public readonly iconPath = vscode.ThemeIcon.File;

    constructor(
        name: string,
        parentTreeItem?: vscode.TreeItem,
        resourceUri?: vscode.Uri,
        public readonly gradleProjectPath = ":",
        collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    ) {
        super(name, parentTreeItem, resourceUri, collapsibleState);
    }
}
