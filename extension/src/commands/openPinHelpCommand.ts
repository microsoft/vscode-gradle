import * as vscode from 'vscode';

export const COMMAND_OPEN_PIN_HELP = 'gradle.openPinHelp';

export async function openPinHelpCommand(): Promise<void> {
  await vscode.window.showInformationMessage(
    'Pin your favourite tasks via the task context menu.'
  );
}
