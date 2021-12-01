// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export class HintItem extends vscode.TreeItem {
    constructor(message: string) {
        super("", vscode.TreeItemCollapsibleState.None);
        this.description = message;
    }
}
