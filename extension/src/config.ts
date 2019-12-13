import * as vscode from 'vscode';

type AutoDetect = 'on' | 'off';

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
