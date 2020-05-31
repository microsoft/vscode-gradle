import * as vscode from 'vscode';
import { TreeItemWithTasksOrGroups } from '..';

export class BookmarkedTasksWorkspaceTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.Folder;
}
