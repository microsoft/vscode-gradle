import * as vscode from 'vscode';

type AutoDetect = 'on' | 'off';

export function getCustomBuildFile(uri: vscode.Uri): string {
  return vscode.workspace
    .getConfiguration('gradle', uri)
    .get<string>('customBuildFile', '');
}

export function getIsAutoDetectionEnabled(
  folder: vscode.WorkspaceFolder
): boolean {
  return (
    vscode.workspace
      .getConfiguration('gradle', folder.uri)
      .get<AutoDetect>('autoDetect', 'on') === 'on'
  );
}

export function getTasksArgs(folder: vscode.WorkspaceFolder): string {
  return vscode.workspace
    .getConfiguration('gradle', folder.uri)
    .get<string>('tasksArgs', '--all');
}

export function getIsTasksExplorerEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<boolean>('enableTasksExplorer', true);
}

export function getHasExplorerNestedSubProjects(): boolean {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<boolean>('explorerNestedSubProjects', true);
}
