import * as vscode from 'vscode';
import * as path from 'path';
import { ICON_WARNING } from './constants';

export class NoTasksTreeItem extends vscode.TreeItem {
  constructor(label: string, context: vscode.ExtensionContext) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'notasks';
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
