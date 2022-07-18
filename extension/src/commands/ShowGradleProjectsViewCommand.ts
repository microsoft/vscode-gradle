// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Command } from "./Command";
export const COMMAND_SHOW_PROJECTS_VIEW = "gradle.showGradleProjectsView";

/**
 * Mock VS Code build-in command gradleTasksView.focus
 */
export class ShowGradleProjectsViewCommand extends Command {
    constructor() {
        super();
    }
    async run(): Promise<void> {
        await vscode.commands.executeCommand("gradleTasksView.focus");
    }
}
