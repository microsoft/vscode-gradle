import * as vscode from 'vscode';

export const COMMAND_CANCELLING_TREE_ITEM_TASK =
  'gradle.cancellingTreeItemTask';

export function cancellingTreeItemTaskCommand(): void {
  vscode.window.showInformationMessage(
    'Gradle task is cancelling, please wait'
  );
}
