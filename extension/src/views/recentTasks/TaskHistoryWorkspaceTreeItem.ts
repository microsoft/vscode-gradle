import * as vscode from 'vscode';
import { TreeItemWithTasksOrGroups } from '../gradleTasks/TreeItemWithTasksOrGroups';

export class TaskHistoryWorkspaceTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.Folder;
}
