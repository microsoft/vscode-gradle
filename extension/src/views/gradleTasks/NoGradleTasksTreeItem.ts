import * as vscode from 'vscode';
import { NoTasksTreeItem } from '..';
import { COMMAND_SHOW_LOGS } from '../../commands/constants';

export class NoGradleTasksTreeItem extends NoTasksTreeItem {
  constructor(context: vscode.ExtensionContext) {
    super('No tasks found', context);
    this.command = {
      title: 'Show Logs',
      command: COMMAND_SHOW_LOGS,
    };
  }
}
