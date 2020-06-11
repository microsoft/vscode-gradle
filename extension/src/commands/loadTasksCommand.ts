import * as vscode from 'vscode';
import { Extension } from '../extension';
export const COMMAND_LOAD_TASKS = 'gradle.loadTasks';

export function loadTasksCommand(): Promise<vscode.Task[]> {
  return Extension.getInstance().getGradleTaskProvider().loadTasks();
}
