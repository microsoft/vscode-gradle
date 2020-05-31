import * as vscode from 'vscode';
import { NoTasksTreeItem } from '..';
import { COMMAND_OPEN_BOOKMARK_HELP } from '../../commands/constants';

export class NoRecentTasksTreeItem extends NoTasksTreeItem {
  constructor(context: vscode.ExtensionContext) {
    super('No tasks have been run', context);
    this.command = {
      title: 'Show Help',
      command: COMMAND_OPEN_BOOKMARK_HELP,
    };
  }
}
