import {
  Command,
  TreeItem,
  TreeItemCollapsibleState,
  ExtensionContext
} from 'vscode';
import path from 'path';

export default class GradleTreeItem extends TreeItem {
  constructor(
    public readonly context: ExtensionContext,
    public readonly label: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly tooltip: string,
    public readonly command?: Command
  ) {
    super(label, collapsibleState);
  }
  contextValue = 'script';
  iconPath = {
    light: this.context.asAbsolutePath(
      path.join('resources', 'light', 'script.svg')
    ),
    dark: this.context.asAbsolutePath(
      path.join('resources', 'dark', 'script.svg')
    )
  };
}
