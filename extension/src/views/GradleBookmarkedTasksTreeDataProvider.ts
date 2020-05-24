import * as vscode from 'vscode';
import * as path from 'path';
import { IconPath } from './types';
import { GradleBookmarkedTaskTreeItem } from './GradleBookmarkedTaskTreeItem';
import { ICON_GRADLE_TASK } from './constants';

export class GradleBookmarkedTasksTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  // private readonly iconPathRunning?: IconPath;
  private readonly iconPath?: IconPath;

  constructor(private readonly context: vscode.ExtensionContext) {
    console.log(this.context);
    this.iconPath = {
      light: this.context.asAbsolutePath(
        path.join('resources', 'light', ICON_GRADLE_TASK)
      ),
      dark: this.context.asAbsolutePath(
        path.join('resources', 'dark', ICON_GRADLE_TASK)
      ),
    };
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    return element
      ? []
      : [
          new GradleBookmarkedTaskTreeItem(
            'bootRun',
            vscode.TreeItemCollapsibleState.None,
            this.iconPath
          ),
          new GradleBookmarkedTaskTreeItem(
            'subproject:bootRun',
            vscode.TreeItemCollapsibleState.None,
            this.iconPath
          ),
        ];
  }
}
