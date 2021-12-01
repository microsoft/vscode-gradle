import * as vscode from "vscode";
import { GradleTaskProvider } from "../tasks";
import { getFindTask } from "../util/input";
import { focusTaskInGradleTasksTree } from "../views/viewUtil";
import { Command } from "./Command";

export const COMMAND_FIND_TASK = "gradle.findTask";

export class FindTaskCommand extends Command {
    constructor(
        private readonly gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>,
        private readonly gradleTaskProvider: GradleTaskProvider
    ) {
        super();
    }
    async run(): Promise<void> {
        const foundTaskName = await getFindTask(this.gradleTaskProvider);
        if (foundTaskName) {
            const vscodeTask = this.gradleTaskProvider.getTasks().find((task) => task.name === foundTaskName);
            if (vscodeTask) {
                await focusTaskInGradleTasksTree(vscodeTask, this.gradleTasksTreeView);
            }
        }
    }
}
