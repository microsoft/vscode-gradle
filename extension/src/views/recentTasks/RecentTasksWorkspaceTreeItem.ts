import * as vscode from 'vscode';
import { TreeItemWithTasksOrGroups } from '..';

export class RecentTasksWorkspaceTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.Folder;
}
