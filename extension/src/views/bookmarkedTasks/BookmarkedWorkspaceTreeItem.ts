import * as vscode from 'vscode';
import { TreeItemWithTasksOrGroups } from '../gradleTasks/TreeItemWithTasksOrGroups';

export class BookmarkedWorkspaceTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.Folder;
}
