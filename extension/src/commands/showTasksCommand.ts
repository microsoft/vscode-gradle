import * as vscode from 'vscode';
import { focusProjectInGradleTasksTree } from '../views/viewUtil';
export const COMMAND_SHOW_TASKS = 'gradle.showTasks';

export async function showTasksCommand(uri: vscode.Uri): Promise<void> {
  await focusProjectInGradleTasksTree(uri);
}
