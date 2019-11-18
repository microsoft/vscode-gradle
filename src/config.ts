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

export function getHasExplorerNestedGroups(): boolean {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<boolean>('explorerNestedGroups', true);
}
