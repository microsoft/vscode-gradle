import * as vscode from "vscode";
import { TreeItemWithTasksOrGroups } from "..";

export class RecentTasksRootProjectTreeItem extends TreeItemWithTasksOrGroups {
    public readonly iconPath = vscode.ThemeIcon.Folder;
}
