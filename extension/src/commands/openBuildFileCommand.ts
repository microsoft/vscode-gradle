import * as vscode from 'vscode';
import { GradleTaskTreeItem } from '../views';

export const COMMAND_OPEN_BUILD_FILE = 'gradle.openBuildFile';

export function openBuildFileCommand(taskItem: GradleTaskTreeItem): void {
  vscode.commands.executeCommand(
    'vscode.open',
    vscode.Uri.file(taskItem.task.definition.buildFile)
  );
}
