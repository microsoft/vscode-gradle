import * as vscode from "vscode";
import * as path from "path";
import * as fse from "fs-extra";
import { GradleTaskTreeItem } from "../views";
import { Command } from "./Command";

export const COMMAND_OPEN_BUILD_FILE = "gradle.openBuildFile";

async function run(path: string): Promise<void> {
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(path));
}

export class OpenBuildFileCommand extends Command {
    async run(item: GradleTaskTreeItem | { uri: string }): Promise<void> {
        if (item instanceof GradleTaskTreeItem) {
            return run(item.task.definition.buildFile);
        } else if (item.uri) {
            const buildFilePath: string = path.join(vscode.Uri.parse(item.uri).fsPath, "build.gradle");
            if (await fse.pathExists(buildFilePath)) {
                return run(buildFilePath);
            }
            const settingsFilePath: string = path.join(vscode.Uri.parse(item.uri).fsPath, "settings.gradle");
            if (await fse.pathExists(settingsFilePath)) {
                return run(settingsFilePath);
            }
        }
    }
}
