import * as vscode from 'vscode';
import { GradleTaskTreeItem } from '../views';

export const COMMAND_OPEN_BUILD_FILE = 'gradle.openBuildFile';
export const COMMAND_OPEN_BUILD_FILE_DOUBLE_CLICK =
  'gradle.openBuildFileDoubleClick';

let lastOpenedDate: Date;

function checkDoubleClick(): boolean {
  let result = false;
  if (lastOpenedDate) {
    const dateDiff = <number>(<any>new Date() - <any>lastOpenedDate);
    result = dateDiff < 500;
  }
  lastOpenedDate = new Date();
  return result;
}

async function run(taskItem: GradleTaskTreeItem): Promise<void> {
  await vscode.commands.executeCommand(
    'vscode.open',
    vscode.Uri.file(taskItem.task.definition.buildFile)
  );
}

export async function openBuildFileDoubleClickCommand(
  taskItem: GradleTaskTreeItem
): Promise<void> {
  if (checkDoubleClick()) {
    return run(taskItem);
  }
}

export async function openBuildFileCommand(
  taskItem: GradleTaskTreeItem
): Promise<void> {
  return run(taskItem);
}
