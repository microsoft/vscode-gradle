import * as vscode from "vscode";
import { GradleDaemonTreeItem } from ".";
import { GradleClient } from "../../client";
import { DaemonInfo } from "../../proto/gradle_pb";
import { RootProjectsStore } from "../../stores";
import { getShowStoppedDaemons, setShowStoppedDaemons } from "../../util/config";
import { Deferred } from "../../util/Deferred";
import { HintItem } from "../gradleTasks/HintItem";

export class GradleDaemonsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private cancelDeferred?: Deferred<vscode.TreeItem[]>;
    private treeItems: vscode.TreeItem[] = [];
    private specificVersion = false;
    private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> =
        new vscode.EventEmitter<vscode.TreeItem | null>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this._onDidChangeTreeData.event;

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

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element || !vscode.workspace.workspaceFolders?.length) {
            return [];
        }
        this.cancelDeferred = new Deferred();
        const cancellationToken = new vscode.CancellationTokenSource();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.cancelDeferred.promise.then(() => cancellationToken.cancel());

        const projectRootFolders = await this.getProjectRootFolders();
        const promises: Promise<GradleDaemonTreeItem[]>[] = projectRootFolders.map((projectRootFolder) =>
            this.client.getDaemonsStatus(projectRootFolder, cancellationToken.token).then((daemonsStatusReply) => {
                if (!daemonsStatusReply) {
                    return [];
                }
                let daemonInfoList = daemonsStatusReply.getDaemonInfoList();
                if (!getShowStoppedDaemons()) {
                    daemonInfoList = daemonInfoList.filter((daemonInfo) => {
                        return daemonInfo.getStatus() !== DaemonInfo.DaemonStatus.STOPPED;
                    });
                }
                return daemonInfoList.map(
                    (daemonInfo) => new GradleDaemonTreeItem(this.context, daemonInfo.getPid(), daemonInfo)
                );
            })
        );
        this.treeItems = await Promise.race([
            Promise.all(promises).then((items) => items.flat()),
            this.cancelDeferred.promise,
        ]);
        this.cancelDeferred = undefined;
        const length = this.treeItems.length;
        await vscode.commands.executeCommand("setContext", "gradle:hasValidDaemons", length);
        if (length) {
            return this.treeItems;
        }
        return this.specificVersion
            ? [new HintItem("Gradle Daemons view is not available when specifying a Gradle version")]
            : [new HintItem("No Gradle Daemons")];
    }

    private async getProjectRootFolders(): Promise<string[]> {
        return (await this.rootProjectsStore.getProjectRootsWithUniqueVersions()).map(
            (rootProject) => rootProject.getProjectUri().fsPath
        );
    }

    public showStoppedDaemons(): void {
        setShowStoppedDaemons(true);
        this.refresh();
    }

    public hideStoppedDaemons(): void {
        setShowStoppedDaemons(false);
        this.refresh();
    }
}
