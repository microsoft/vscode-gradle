import * as vscode from 'vscode';
import { TreeItemWithTasksOrGroups } from './TreeItemWithTasksOrGroups';

export class ProjectTreeItem extends TreeItemWithTasksOrGroups {
  public readonly iconPath = vscode.ThemeIcon.File;
}
