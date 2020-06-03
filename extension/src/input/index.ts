import * as vscode from 'vscode';
import { TaskArgs } from '../stores/types';
import { getDisableConfirmations } from '../config';

export function getTaskArgs(): Thenable<TaskArgs | undefined> {
  return vscode.window
    .showInputBox({
      placeHolder: 'For example: --info',
      ignoreFocusOut: true,
    })
    .then((value: string | undefined) => {
      if (value !== undefined) {
        return value.trim();
      }
    });
}

export async function confirmModal(message: string): Promise<boolean> {
  if (getDisableConfirmations()) {
    return true;
  }
  const CONFIRM = 'Yes';
  const result = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    CONFIRM
  );
  return result === CONFIRM;
}
