import * as vscode from "vscode";
import { Command } from "./Command";

export const COMMAND_CANCELLING_TREE_ITEM_TASK = "gradle.cancellingTreeItemTask";

export class CancellingTreeItemTaskCommand extends Command {
    async run(): Promise<void> {
        await vscode.window.showInformationMessage("Gradle task is cancelling, please wait");
    }
}
