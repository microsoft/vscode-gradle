import * as vscode from "vscode";
import { GradleDaemonTreeItem } from ".";
import { RootProjectsStore } from "../../stores";
import { getShowStoppedDaemons, setShowStoppedDaemons } from "../../util/config";
import { Deferred } from "../../util/Deferred";
import { HintItem } from "../gradleTasks/HintItem";
import { GradleStatus } from "./services/GradleStatus";
import { DaemonStatus } from "./models/DaemonStatus";
export class GradleDaemonsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private cancelDeferred?: Deferred<vscode.TreeItem[]>;
    private treeItems: vscode.TreeItem[] = [];
    private specificVersion = false;
    private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> =
        new vscode.EventEmitter<vscode.TreeItem | null>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this._onDidChangeTreeData.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly rootProjectsStore: RootProjectsStore
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
        const promises: Promise<GradleDaemonTreeItem[]>[] = projectRootFolders.map(async (projectRootFolder) => {
            const daemonInfos = await GradleStatus.getDaemonsStatusList(projectRootFolder);

            let filteredDaemonInfos = daemonInfos;
            if (!getShowStoppedDaemons()) {
                filteredDaemonInfos = daemonInfos.filter(
                    (daemonInfo) => daemonInfo.getStatus() !== DaemonStatus.STOPPED
                );
            }

            return filteredDaemonInfos.map(
                (daemonInfo) => new GradleDaemonTreeItem(this.context, daemonInfo.getPid(), daemonInfo)
            );
        });

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
