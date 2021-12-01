import * as vscode from "vscode";
import { TREE_ITEM_STATE_NO_TASKS } from "./constants";

export class NoTasksTreeItem extends vscode.TreeItem {
    constructor(message: string) {
        super("", vscode.TreeItemCollapsibleState.None);
        this.contextValue = TREE_ITEM_STATE_NO_TASKS;
        this.description = message;
    }
}
