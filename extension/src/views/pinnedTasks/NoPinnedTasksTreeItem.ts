import * as vscode from 'vscode';
import { NoTasksTreeItem } from '..';
import { COMMAND_OPEN_PIN_HELP } from '../../commands/constants';

export class NoPinnedTasksTreeItem extends NoTasksTreeItem {
  constructor(context: vscode.ExtensionContext) {
    super('No pinned tasks', context);
    this.command = {
      title: 'Show Help',
      command: COMMAND_OPEN_PIN_HELP,
    };
  }
}
