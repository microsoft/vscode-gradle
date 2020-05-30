import * as vscode from 'vscode';
import { GradleDaemonTreeItem } from './GradleDaemonTreeItem';
import { Deferred } from '../../async/Deferred';
import { Extension } from '../../extension/Extension';

export class GradleDaemonsTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private cancelDeferred?: Deferred<vscode.TreeItem[]>;
  private treeItems: vscode.TreeItem[] = [];
  private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public refresh(): void {
    this.cancelDeferred?.resolve(this.treeItems);
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
    this.cancelDeferred = new Deferred();
    const promises: Promise<
      GradleDaemonTreeItem[]
    >[] = vscode.workspace.workspaceFolders.map((folder) =>
      Extension.getInstance()
        .client.getDaemonsStatus(folder.uri.fsPath)
        .then((status) =>
          status
            ? status
                .getDaemonInfoList()
                .map(
                  (daemonInfo) =>
                    new GradleDaemonTreeItem(
                      this.context,
                      daemonInfo.getPid(),
                      daemonInfo
                    )
                )
            : []
        )
    );
    this.treeItems = await Promise.race([
      Promise.all(promises).then((items) => items.flat()),
      this.cancelDeferred.promise,
    ]);
    return this.treeItems;
  }
}
