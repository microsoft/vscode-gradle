import * as vscode from "vscode";
import { GradleTaskTreeItem } from ".";
import { GroupTreeItem } from "..";
import { treeItemSortCompareFunc, gradleTaskTreeItemSortCompareFunc } from "../viewUtil";

export class TreeItemWithTasksOrGroups extends vscode.TreeItem {
    private readonly _tasks: GradleTaskTreeItem[] = [];
    private readonly _groups: GroupTreeItem[] = [];
    public readonly parentTreeItem?: vscode.TreeItem;
    public readonly iconPath = new vscode.ThemeIcon("file-submodule");
    public readonly contextValue = "folder";
    constructor(
        name: string,
        parentTreeItem?: vscode.TreeItem,
        resourceUri?: vscode.Uri,
        collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    ) {
        super(name, collapsibleState);
        this.resourceUri = resourceUri;
        this.parentTreeItem = parentTreeItem;
    }

    public addTask(task: GradleTaskTreeItem): void {
        this._tasks.push(task);
    }

    public get tasks(): GradleTaskTreeItem[] {
        return this._tasks.sort(gradleTaskTreeItemSortCompareFunc);
    }

    public addGroup(group: GroupTreeItem): void {
        this._groups.push(group);
    }

    public get groups(): GroupTreeItem[] {
        return this._groups.sort(treeItemSortCompareFunc);
    }
}
