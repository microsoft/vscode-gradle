import * as vscode from "vscode";
import { ProjectTreeItem } from ".";
import { TREE_ITEM_STATE_FOLDER } from "../constants";

export class RootProjectTreeItem extends vscode.TreeItem {
    public readonly projects: ProjectTreeItem[] = [];
    public readonly parentTreeItem: RootProjectTreeItem | null = null;

    constructor(name: string, resourceUri: vscode.Uri) {
        super(name, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = TREE_ITEM_STATE_FOLDER;
        this.resourceUri = resourceUri;
        this.iconPath = vscode.ThemeIcon.Folder;
    }

    public addProject(project: ProjectTreeItem): void {
        this.projects.push(project);
    }
}
