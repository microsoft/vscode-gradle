// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { getProjectTreeItemMap } from "../views/gradleTasks/GradleTasksTreeDataProvider";
import { Command } from "./Command";
export const COMMAND_RELOAD_JAVA_PROJECT = "gradle.java.projectConfiguration.update";

export class ReloadJavaProjectsCommand extends Command {
    constructor() {
        super();
    }
    async run(): Promise<void> {
        const projectsMap = getProjectTreeItemMap();
        if (projectsMap?.size) {
            // call Reload All Java Projects in redhat.java
            vscode.commands.executeCommand(
                "java.projectConfiguration.update",
                Array.from(projectsMap.keys()).map((p) => vscode.Uri.file(p))
            );
        }
    }
}
