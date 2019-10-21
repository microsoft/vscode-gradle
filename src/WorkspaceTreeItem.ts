import {
  Command,
  TreeItem,
  TreeItemCollapsibleState,
  ThemeIcon
} from 'vscode';

export default class WorkspaceTreeItem extends TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly tooltip: string,
    public readonly command?: Command
  ) {
    super(label, collapsibleState);
  }
  iconPath = ThemeIcon.Folder;
  contextValue = 'workspaceFolder';
}
