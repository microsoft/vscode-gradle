import * as vscode from "vscode";
import { Command } from "./Command";

export const COMMAND_OPEN_PIN_HELP = "gradle.openPinHelp";

export class OpenPinHelpCommand extends Command {
    async run(): Promise<void> {
        await vscode.window.showInformationMessage("Pin your favourite tasks via the task context menu.");
    }
}
