import * as vscode from 'vscode';
import { NoTasksTreeItem } from '..';

export class NoRecentTasksTreeItem extends NoTasksTreeItem {
  constructor(context: vscode.ExtensionContext) {
    super('No recent tasks', context);
  }
}
