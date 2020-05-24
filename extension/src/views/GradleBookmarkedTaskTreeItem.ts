import * as vscode from 'vscode';
import { IconPath } from './types';

export class GradleBookmarkedTaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly iconPath?: IconPath
  ) {
    super(label, collapsibleState);
  }
}
