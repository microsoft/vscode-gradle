import * as vscode from "vscode";
import { Command } from "./Command";

export const COMMAND_OPEN_SETTINGS = "gradle.openSettings";
const EXTENSION_NAME = "vscjava.vscode-gradle";

export class OpenSettingsCommand extends Command {
    async run(): Promise<void> {
        await vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${EXTENSION_NAME}`);
    }
}
