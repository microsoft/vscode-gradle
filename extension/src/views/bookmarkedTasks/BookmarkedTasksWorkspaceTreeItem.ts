import * as vscode from 'vscode';
import { TreeItemWithTasksOrGroups } from '../gradleTasks/TreeItemWithTasksOrGroups';

export class BookmarkedTasksWorkspaceTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.Folder;
}
