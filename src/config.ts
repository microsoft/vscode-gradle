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

export function getJavaHome(): string | null {
  return vscode.workspace
    .getConfiguration('java')
    .get<string | null>('home', null);
}

export function getIsDebugEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<boolean>('debug', false);
}

export function getFocusTaskInExplorer(): boolean {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<boolean>('focusTaskInExplorer', true);
}

export type ConfigTaskPresentationOptionsRevealKind =
  | 'always'
  | 'never'
  | 'silent';

export type ConfigTaskPresentationOptionsPanelKind =
  | 'shared'
  | 'dedicated'
  | 'new';

export interface ConfigTaskPresentationOptions
  extends Omit<vscode.TaskPresentationOptions, 'reveal' | 'panel'> {
  reveal: ConfigTaskPresentationOptionsRevealKind;
  panel: ConfigTaskPresentationOptionsPanelKind;
}

export function getTaskPresentationOptions(): ConfigTaskPresentationOptions {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<ConfigTaskPresentationOptions>('taskPresentationOptions', {
      reveal: 'always',
      focus: true,
      echo: true,
      showReuseMessage: false,
      panel: 'shared',
      clear: true,
    });
}
