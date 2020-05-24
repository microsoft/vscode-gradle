import * as vscode from 'vscode';
import { GradleTasksClient } from '../client';
import { GradleDaemonTreeItem } from './GradleDaemonTreeItem';
import { DAEMON_STATUS_BUSY } from './constants';

function treeItemSortCompareFunc(
  treeItemA: GradleDaemonTreeItem,
  treeItemB: GradleDaemonTreeItem
): number {
  if (
    treeItemA.status === DAEMON_STATUS_BUSY &&
    treeItemB.status === DAEMON_STATUS_BUSY
  ) {
    return treeItemA.pidAsInt - treeItemB.pidAsInt;
  } else if (treeItemA.status === DAEMON_STATUS_BUSY) {
    return -1;
  }
  return treeItemA.pidAsInt - treeItemB.pidAsInt;
}

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
        .getStatus(folder.uri.fsPath)
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
    return (await Promise.all(promises)).flat().sort(treeItemSortCompareFunc);
  }
}
