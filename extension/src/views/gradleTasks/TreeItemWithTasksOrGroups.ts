import * as vscode from 'vscode';
import { GradleTaskTreeItem } from './GradleTaskTreeItem';
import { GroupTreeItem } from './GroupTreeItem';
import { treeItemSortCompareFunc } from '../viewUtil';

export class TreeItemWithTasksOrGroups extends vscode.TreeItem {
  private readonly _tasks: GradleTaskTreeItem[] = [];
  private readonly _groups: GroupTreeItem[] = [];
  public readonly parentTreeItem: vscode.TreeItem;
  public readonly iconPath = vscode.ThemeIcon.Folder;
  public readonly contextValue = 'folder';
  constructor(
    name: string,
    parentTreeItem: vscode.TreeItem,
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
    return this._tasks.sort(treeItemSortCompareFunc);
  }

  public addGroup(group: GroupTreeItem): void {
    this._groups.push(group);
  }

  public get groups(): GroupTreeItem[] {
    return this._groups.sort(treeItemSortCompareFunc);
  }
}
