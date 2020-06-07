import * as vscode from 'vscode';

export const COMMAND_OPEN_SETTINGS = 'gradle.openSettings';
const EXTENSION_NAME = 'richardwillis.vscode-gradle';

export function openSettingsCommand(): void {
  vscode.commands.executeCommand(
    'workbench.action.openSettings',
    `@ext:${EXTENSION_NAME}`
  );
}
