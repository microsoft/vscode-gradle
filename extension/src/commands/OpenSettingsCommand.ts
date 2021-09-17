import * as fse from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { Command } from './Command';

export const COMMAND_OPEN_SETTINGS = 'gradle.openSettings';

export class OpenSettingsCommand extends Command {
  constructor(private readonly context: vscode.ExtensionContext) {
    super();
  }

  async run(): Promise<void> {
    const packageContent = await fse.readFile(
      path.join(this.context.extensionPath, 'package.json')
    );
    const packageJSON = JSON.parse(packageContent.toString());
    const name = packageJSON.name;
    const publisher = packageJSON.publisher;
    if (name && publisher) {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${publisher}.${name}`
      );
    }
  }
}
