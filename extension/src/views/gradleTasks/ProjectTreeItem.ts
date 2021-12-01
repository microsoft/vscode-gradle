import * as vscode from "vscode";
import { TreeItemWithTasksOrGroups } from ".";

export class ProjectTreeItem extends TreeItemWithTasksOrGroups {
    public readonly iconPath = vscode.ThemeIcon.File;
}
