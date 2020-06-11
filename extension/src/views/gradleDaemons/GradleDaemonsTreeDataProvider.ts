import * as vscode from 'vscode';
import { Deferred } from '../../async';
import { GradleDaemonTreeItem } from '.';
import { Extension } from '../../extension';
import { GradleTaskDefinition, GradleTaskProvider } from '../../tasks';

export class GradleDaemonsTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private cancelDeferred?: Deferred<vscode.TreeItem[]>;
  private treeItems: vscode.TreeItem[] = [];
  private taskProjectFolders: string[] = [];
  private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
    ._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly gradleTaskProvider: GradleTaskProvider
  ) {
    this.context.subscriptions.push(
      this.gradleTaskProvider.onDidLoadTasks(async () => {
        const tasks = await this.gradleTaskProvider.getTasks();
        this.taskProjectFolders = [
          ...new Set(
            tasks.map((task) => {
              const definition = task.definition as GradleTaskDefinition;
              return definition.projectFolder;
            })
          ),
        ];
        this.refresh();
      })
    );
  }

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
    >[] = this.taskProjectFolders.map((folder) =>
      Extension.getInstance()
        .getClient()
        .getDaemonsStatus(folder)
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
