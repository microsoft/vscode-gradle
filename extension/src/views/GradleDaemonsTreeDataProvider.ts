import * as vscode from 'vscode';
import { GradleTasksClient } from '../client';
import { GradleDaemonTreeItem } from './GradleDaemonTreeItem';

export class GradleDaemonsTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: GradleTasksClient
  ) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(
    element?: vscode.TreeItem
  ): Promise<vscode.TreeItem[]> {
    if (element || !vscode.workspace.workspaceFolders?.length) {
      return [];
    }
    const promises: Promise<
      GradleDaemonTreeItem[]
    >[] = vscode.workspace.workspaceFolders.map((folder) =>
      this.client
        .getDaemonsStatus(folder.uri.fsPath)
        .then((status) =>
          status
            .getDaemonInfoList()
            .map(
              (daemonInfo) =>
                new GradleDaemonTreeItem(
                  this.context,
                  daemonInfo.getPid(),
                  daemonInfo
                )
            )
        )
    );
    return (await Promise.all(promises)).flat();
  }
}
