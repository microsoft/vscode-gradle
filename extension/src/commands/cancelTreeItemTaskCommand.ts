import * as vscode from 'vscode';
import { GradleTaskTreeItem } from '../views';
import { COMMAND_CANCEL_TASK } from '.';
export const COMMAND_CANCEL_TREE_ITEM_TASK = 'gradle.cancelTreeItemTask';

export async function cancelTreeItemTaskCommand(
  treeItem: GradleTaskTreeItem
): Promise<void> {
  if (treeItem && treeItem.task) {
    return vscode.commands.executeCommand(COMMAND_CANCEL_TASK, treeItem.task);
  }
}
