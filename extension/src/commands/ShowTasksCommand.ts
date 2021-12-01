import * as vscode from "vscode";
import { focusProjectInGradleTasksTree } from "../views/viewUtil";
import { Command } from "./Command";
export const COMMAND_SHOW_TASKS = "gradle.showTasks";

export class ShowTasksCommand extends Command {
    constructor(private gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>) {
        super();
    }
    async run(uri: vscode.Uri): Promise<void> {
        await focusProjectInGradleTasksTree(uri, this.gradleTasksTreeView);
    }
}
