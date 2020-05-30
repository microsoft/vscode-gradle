import * as vscode from 'vscode';
import { TaskArgs } from '../stores/types';

export function getTaskArgs(): Thenable<TaskArgs | undefined> {
  return vscode.window.showInputBox({
    placeHolder: 'For example: --info',
    ignoreFocusOut: true,
  });
}
