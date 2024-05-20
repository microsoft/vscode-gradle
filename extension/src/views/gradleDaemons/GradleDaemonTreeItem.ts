import * as vscode from "vscode";
import * as path from "path";
import { DAEMON_ICON_MAP } from "../constants";
import { DaemonInfo } from "./models/DaemonInfo";
import { DaemonStatus } from "./models/DaemonStatus";

export class GradleDaemonTreeItem extends vscode.TreeItem {
    private status: string;
    constructor(
        private readonly context: vscode.ExtensionContext,
        public readonly label: string,
        private readonly daemonInfo: DaemonInfo
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        const iconName = DAEMON_ICON_MAP[daemonInfo.getStatus()];
        this.iconPath = {
            light: this.context.asAbsolutePath(path.join("resources", "light", iconName)),
            dark: this.context.asAbsolutePath(path.join("resources", "dark", iconName)),
        };
        this.status = DaemonStatus[daemonInfo.getStatus()];
        this.description = this.status;
        this.contextValue = this.status.toLowerCase();
        this.tooltip = `${this.status} - ${daemonInfo.getInfo()}`;
    }

    public get pid(): string {
        return this.daemonInfo.getPid();
    }
}
