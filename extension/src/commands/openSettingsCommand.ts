import * as vscode from 'vscode';

export const COMMAND_OPEN_SETTINGS = 'gradle.openSettings';
const EXTENSION_NAME = 'richardwillis.vscode-gradle';

export async function openSettingsCommand(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    `@ext:${EXTENSION_NAME}`
  );
}
