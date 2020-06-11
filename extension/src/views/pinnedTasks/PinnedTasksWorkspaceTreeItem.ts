import * as vscode from 'vscode';
import { TreeItemWithTasksOrGroups } from '..';

export class PinnedTasksWorkspaceTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.Folder;
}
