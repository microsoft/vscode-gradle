import * as vscode from 'vscode';
import { TreeItemWithTasksOrGroups } from '../gradleTasks/TreeItemWithTasksOrGroups';

export class RecentTasksWorkspaceTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.Folder;
}
