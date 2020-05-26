import * as vscode from 'vscode';
import * as path from 'path';
import { ICON_WARNING } from './constants';

export class NoTasksTreeItem extends vscode.TreeItem {
  constructor(context: vscode.ExtensionContext) {
    super('No tasks found', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'notasks';
    this.command = {
      title: 'Show Logs',
      command: 'gradle.showLogs',
    };
    this.iconPath = {
      light: context.asAbsolutePath(
        path.join('resources', 'light', ICON_WARNING)
      ),
      dark: context.asAbsolutePath(
        path.join('resources', 'dark', ICON_WARNING)
      ),
    };
  }
}
