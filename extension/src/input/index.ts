import * as vscode from 'vscode';
import { TaskArgs } from '../stores/types';
import { getDisableConfirmations } from '../config';
import { RootProject } from '../rootProject/RootProject';
import { RootProjectsStore } from '../stores';

function returnTrimmedInput(value: string | undefined): string | undefined {
  if (value !== undefined) {
    return value.trim();
  }
}

export function getTaskArgs(): Thenable<TaskArgs | undefined> {
  return vscode.window
    .showInputBox({
      placeHolder: 'For example: --info',
      ignoreFocusOut: true,
    })
    .then(returnTrimmedInput);
}

export function getGradleCommand(): Thenable<TaskArgs | undefined> {
  return vscode.window
    .showInputBox({
      prompt: [
        'Enter a command for gradle to run.',
        'This can include built-in Gradle commands or tasks.',
        'Not all Gradle command line options are supported.',
      ].join(' '),
      placeHolder: 'For example: build --info',
      ignoreFocusOut: true,
    })
    .then(returnTrimmedInput);
}

export async function getRootProjectFolder(
  rootProjectsStore: RootProjectsStore
): Promise<RootProject | undefined> {
  const rootProjects = rootProjectsStore.getProjectRoots();
  if (rootProjects.length === 1) {
    return Promise.resolve(rootProjects[0]);
  }
  const rootProjectPaths = rootProjects.map(
    (rootProject) => rootProject.getProjectUri().fsPath
  );
  const selectedRootProjectPath = await vscode.window.showQuickPick(
    rootProjectPaths,
    {
      canPickMany: false,
      placeHolder: 'Select the root project',
    }
  );
  if (selectedRootProjectPath) {
    return rootProjects[rootProjectPaths.indexOf(selectedRootProjectPath)];
  }
}

export async function confirmModal(message: string): Promise<boolean> {
  if (getDisableConfirmations()) {
    return true;
  }
  const CONFIRM = 'Yes';
  const result = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    CONFIRM
  );
  return result === CONFIRM;
}
