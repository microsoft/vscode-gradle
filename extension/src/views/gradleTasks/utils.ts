// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GradleTaskTreeItem } from ".";
import { Icons } from "../../icons";
import { GradleTaskDefinition } from "../../tasks";
import { PinnedTasksTreeItem } from "./PinnedTasksTreeItem";

export function buildPinnedTaskTreeItem(
    parentTreeItem: PinnedTasksTreeItem,
    task: vscode.Task,
    icons: Icons
): GradleTaskTreeItem {
    const definition = task.definition as GradleTaskDefinition;
    definition.isPinned = true;
    const taskName = task.name;
    const pinnedTaskTreeItem = new GradleTaskTreeItem(
        parentTreeItem,
        task,
        taskName,
        definition.description || taskName, // tooltip
        "", // description
        icons,
        definition.javaDebug
    );
    pinnedTaskTreeItem.setContext();
    return pinnedTaskTreeItem;
}
