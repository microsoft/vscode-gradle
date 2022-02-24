// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export class DoubleClickChecker {
    private lastDate: Date | undefined;
    private lastItem: vscode.TreeItem | undefined;

    private resetState(): void {
        this.lastDate = undefined;
        this.lastItem = undefined;
    }

    private setState(item: vscode.TreeItem): void {
        this.lastDate = new Date();
        this.lastItem = item;
    }

    public checkDoubleClick(item: vscode.TreeItem): boolean {
        if (this.lastDate && new Date().getTime() - this.lastDate.getTime() < 500 && this.lastItem === item) {
            this.resetState();
            return true;
        }
        this.setState(item);
        return false;
    }
}
