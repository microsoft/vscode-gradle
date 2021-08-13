// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';

export class DependencyConfigurationTreeItem extends vscode.TreeItem {
  private children: vscode.TreeItem[] | undefined;
  constructor(
    name: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly parentTreeItem: vscode.TreeItem,
    // TODO: https://github.com/microsoft/vscode-codicons/issues/77
    iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('file-submodule')
  ) {
    super(name, collapsibleState);
    this.iconPath = iconPath;
  }

  public setChildren(children: vscode.TreeItem[]): void {
    this.children = children;
  }

  public getChildren(): vscode.TreeItem[] | undefined {
    return this.children;
  }
}
