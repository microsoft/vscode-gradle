import * as vscode from "vscode";
import { Icons } from "../../icons";
import { TASK_STATE_RUNNING_REGEX } from "../constants";
import { getTreeItemState } from "../viewUtil";

export class GradleTaskTreeItem extends vscode.TreeItem {
    constructor(
        public readonly parentTreeItem: vscode.TreeItem,
        public readonly task: vscode.Task,
        public readonly label: string,
        public tooltip: string,
        public description: string,
        protected readonly icons: Icons,
        protected readonly javaDebug: boolean
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = {
            title: "Run Task",
            command: "gradle.openBuildFileDoubleClick",
            arguments: [this],
        };
    }

    public setContext(): void {
        this.contextValue = getTreeItemState(this.task, this.task.definition.args);
        this.setIconState();
    }

    protected setIconState(): void {
        const { iconPathRunning, iconPathIdle } = this.icons;
        if (this.contextValue && TASK_STATE_RUNNING_REGEX.test(this.contextValue)) {
            this.iconPath = iconPathRunning;
        } else {
            this.iconPath = iconPathIdle;
        }
    }
}
