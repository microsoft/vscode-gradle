import * as vscode from 'vscode';
import { updateGradleTreeItemStateForTask } from '../views/viewUtil';
export const COMMAND_RENDER_TASK = 'gradle.renderTask';

export function renderTaskCommand(task: vscode.Task): void {
  updateGradleTreeItemStateForTask(task);
}
