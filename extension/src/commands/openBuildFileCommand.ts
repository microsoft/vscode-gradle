import * as vscode from 'vscode';
import { GradleTaskTreeItem } from '../views';

export const COMMAND_OPEN_BUILD_FILE = 'gradle.openBuildFile';

export async function openBuildFileCommand(
  taskItem: GradleTaskTreeItem
): Promise<void> {
  await vscode.commands.executeCommand(
    'vscode.open',
    vscode.Uri.file(taskItem.task.definition.buildFile)
  );
}
