import * as vscode from 'vscode';
import { GradleDaemonTreeItem } from '.';
import { Deferred } from '../../async';
import { RootProjectsStore } from '../../stores';
import { GradleClient } from '../../client';

export class GradleDaemonsTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private cancelDeferred?: Deferred<vscode.TreeItem[]>;
  private treeItems: vscode.TreeItem[] = [];
  private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly rootProjectsStore: RootProjectsStore,
    private readonly client: GradleClient
  ) {}

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
    const cancellationToken = new vscode.CancellationTokenSource();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.cancelDeferred.promise.then(() => cancellationToken.cancel());

    const projectRootFolders = await this.getProjectRootFolders();
    const promises: Promise<
      GradleDaemonTreeItem[]
    >[] = projectRootFolders.map((projectRootFolder) =>
      this.client
        .getDaemonsStatus(projectRootFolder, cancellationToken.token)
        .then((getDaemonsStatusReply) =>
          getDaemonsStatusReply
            ? getDaemonsStatusReply
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
    this.cancelDeferred = undefined;
    return this.treeItems;
  }

  private async getProjectRootFolders(): Promise<string[]> {
    return (
      await this.rootProjectsStore.buildAndGetProjectRootsWithUniqueVersions()
    ).map((rootProject) => rootProject.getProjectUri().fsPath);
  }
}
