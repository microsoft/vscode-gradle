import * as vscode from "vscode";
import * as path from "path";
import * as fse from "fs-extra";
import { GradleTaskTreeItem } from "../views";
import { Command } from "./Command";
import { GRADLE_BUILD_FILE_NAMES } from "../constant";

export const COMMAND_OPEN_BUILD_FILE = "gradle.openBuildFile";

async function run(path: string): Promise<void> {
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(path));
}

export class OpenBuildFileCommand extends Command {
    async run(item: GradleTaskTreeItem | { uri: string }): Promise<void> {
        if (item instanceof GradleTaskTreeItem) {
            return run(item.task.definition.buildFile);
        } else if (item.uri) {
            const buildFilePath = await ensureBuildFilePath(item.uri);
            if (buildFilePath) {
                return run(buildFilePath);
            }
        }
    }
}

export async function ensureBuildFilePath(projectUri: string): Promise<string | undefined> {
    const projectFsPath = vscode.Uri.parse(projectUri).fsPath;
    for (const buildFileName of GRADLE_BUILD_FILE_NAMES) {
        const buildFilePath: string = path.join(projectFsPath, buildFileName);
        if (await fse.pathExists(buildFilePath)) {
            return buildFilePath;
        }
    }
    return undefined;
}
