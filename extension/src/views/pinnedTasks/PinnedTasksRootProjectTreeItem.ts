import * as vscode from "vscode";
import { TreeItemWithTasksOrGroups } from "..";

export class PinnedTasksRootProjectTreeItem extends TreeItemWithTasksOrGroups {
    public readonly iconPath = vscode.ThemeIcon.Folder;
}
