import * as vscode from "vscode";
import { GradleTaskTreeItem } from "../views";
import { Command } from "./Command";

export const COMMAND_OPEN_BUILD_FILE = "gradle.openBuildFile";

async function run(taskItem: GradleTaskTreeItem): Promise<void> {
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(taskItem.task.definition.buildFile));
}

export class OpenBuildFileCommand extends Command {
    async run(taskItem: GradleTaskTreeItem): Promise<void> {
        return run(taskItem);
    }
}
