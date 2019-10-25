import {
  Command,
  TreeItem,
  TreeItemCollapsibleState,
  ExtensionContext
} from 'vscode';
import path from 'path';

export default class GradleTreeItem extends TreeItem {
  contextValue = 'script';
  iconPath = {
    light: this.context.asAbsolutePath(
      path.join('resources', 'light', 'script.svg')
    ),
    dark: this.context.asAbsolutePath(
      path.join('resources', 'dark', 'script.svg')
    )
  };
  constructor(
    readonly context: ExtensionContext,
    readonly label: string,
    readonly collapsibleState: TreeItemCollapsibleState,
    readonly tooltip: string,
    readonly command?: Command
  ) {
    super(label, collapsibleState);
  }
}
