import { workspace, WorkspaceFolder } from 'vscode';

type AutoDetect = 'on' | 'off';

export function getCustomBuildFile(folder: WorkspaceFolder): string {
  return workspace
    .getConfiguration('gradle', folder.uri)
    .get<string>('customBuildFile', '');
}

export function getIsAutoDetectionEnabled(folder: WorkspaceFolder): boolean {
  return (
    workspace
      .getConfiguration('gradle', folder.uri)
      .get<AutoDetect>('autoDetect', 'on') === 'on'
  );
}

export function getTasksArgs(folder: WorkspaceFolder): string {
  return workspace
    .getConfiguration('gradle', folder.uri)
    .get<string>('tasksArgs', '--all');
}

export function getIsTasksExplorerEnabled(): boolean {
  return workspace
    .getConfiguration('gradle')
    .get<boolean>('enableTasksExplorer', true);
}
