import { Command, TreeItem, TreeItemCollapsibleState } from 'vscode';

export default class GradleTreeItem extends TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly tooltip: string,
    public readonly command?: Command
  ) {
    super(label, collapsibleState);
  }
  contextValue = 'script';
}
