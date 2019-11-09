import { workspace, WorkspaceFolder, Uri } from 'vscode';

type AutoDetect = 'on' | 'off';

export function getCustomBuildFile(uri: Uri): string {
  return workspace
    .getConfiguration('gradle', uri)
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

export function getHasExplorerNestedSubProjects(): boolean {
  return workspace
    .getConfiguration('gradle')
    .get<boolean>('explorerNestedSubProjects', true);
}
