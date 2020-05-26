import * as vscode from 'vscode';
import { NoTasksTreeItem } from '../NoTasksTreeItem';
import { COMMAND_OPEN_BOOKMARK_HELP } from '../../commands/constants';

export class NoBookmarkedTasksTreeItem extends NoTasksTreeItem {
  constructor(context: vscode.ExtensionContext) {
    super('No bookmarked tasks', context);
    this.command = {
      title: 'Show Help',
      command: COMMAND_OPEN_BOOKMARK_HELP,
    };
  }
}
