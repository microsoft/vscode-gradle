import * as vscode from 'vscode';

export const COMMAND_CANCELLING_TREE_ITEM_TASK =
  'gradle.cancellingTreeItemTask';

export async function cancellingTreeItemTaskCommand(): Promise<void> {
  await vscode.window.showInformationMessage(
    'Gradle task is cancelling, please wait'
  );
}
