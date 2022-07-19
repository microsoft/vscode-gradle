// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GradleTaskProvider } from "../tasks";
import { getRunTasks } from "../util/input";
import { Command } from "./Command";

export const COMMAND_RUN_TASKS = "gradle.runTasks";

export class RunTasksCommand extends Command {
    constructor(private readonly gradleTaskProvider: GradleTaskProvider) {
        super();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async run(item?: any): Promise<void> {
        if (item?.uri) {
            const foundTaskName = await getRunTasks(this.gradleTaskProvider, item.uri);
            if (foundTaskName) {
                const vscodeTask = this.gradleTaskProvider.getTasks().find((task) => task.name === foundTaskName);
                if (vscodeTask) {
                    await vscode.tasks.executeTask(vscodeTask);
                }
            }
        }
    }
}
