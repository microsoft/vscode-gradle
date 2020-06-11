import * as vscode from 'vscode';
import { focusProjectInGradleTasksTree } from '../views/viewUtil';
export const COMMAND_SHOW_TASKS = 'gradle.showTasks';

export function showTasksCommand(uri: vscode.Uri): void {
  focusProjectInGradleTasksTree(uri);
}
