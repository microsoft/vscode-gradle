import * as vscode from 'vscode';
import * as path from 'path';
import { getNestedProjectsConfig, getConfigJavaDebug } from '../util';
import { StoreMap } from '.';
import { isGradleRootProject } from '../util';
import { RootProject } from '../rootProject/RootProject';

async function getNestedRootProjectFolders(): Promise<string[]> {
  const matchingNestedWrapperFiles = await vscode.workspace.findFiles(
    '**/{gradlew,gradlew.bat}'
  );
  return [
    ...new Set(
      matchingNestedWrapperFiles.map((uri) => path.dirname(uri.fsPath))
    ),
  ];
}

function buildRootFolder(folderUri: vscode.Uri): RootProject {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri)!;
  const javaDebug = getConfigJavaDebug(workspaceFolder);
  return new RootProject(workspaceFolder, folderUri, javaDebug);
}

function getGradleProjectFoldersOutsideRoot(
  configNestedFolders: boolean | ReadonlyArray<string>,
  gradleProjectFolders: string[],
  workspaceFolder: vscode.WorkspaceFolder
): string[] {
  if (configNestedFolders === true) {
    return gradleProjectFolders.filter(
      (projectFolder) => projectFolder !== workspaceFolder.uri.fsPath
    );
  } else if (Array.isArray(configNestedFolders)) {
    return configNestedFolders.map((nestedfolder) => {
      return path.join(workspaceFolder.uri.fsPath, nestedfolder);
    });
  }
  return [];
}

export class RootProjectsStore extends StoreMap<string, RootProject> {
  private isPopulated = false;
  private populatePromise: Promise<void> | undefined = undefined;

  public async populate(): Promise<void> {
    const workspaceFolders: ReadonlyArray<vscode.WorkspaceFolder> =
      vscode.workspace.workspaceFolders || [];
    const gradleProjectFolders = await getNestedRootProjectFolders();

    for (const workspaceFolder of workspaceFolders) {
      const configNestedFolders = getNestedProjectsConfig(workspaceFolder);
      const gradleProjectFoldersOutsideRoot = getGradleProjectFoldersOutsideRoot(
        configNestedFolders,
        gradleProjectFolders,
        workspaceFolder
      );
      if (gradleProjectFolders.includes(workspaceFolder.uri.fsPath)) {
        this.setRootProjectFolder(buildRootFolder(workspaceFolder.uri));
      }
      gradleProjectFoldersOutsideRoot
        .map((folder) => buildRootFolder(vscode.Uri.file(folder)))
        .forEach(this.setRootProjectFolder);
    }
    this.isPopulated = true;
    this.fireOnDidChange(null);
  }

  private setRootProjectFolder = (rootProject: RootProject): void => {
    if (isGradleRootProject(rootProject)) {
      this.setItem(rootProject.getProjectUri().fsPath, rootProject, false);
    }
  };

  public async getProjectRoots(): Promise<RootProject[]> {
    if (!this.isPopulated) {
      if (!this.populatePromise) {
        this.populatePromise = this.populate();
      }
      await this.populatePromise;
      this.populatePromise = undefined;
    }
    return [...this.getData().values()];
  }

  public async getProjectRootsWithUniqueVersions(): Promise<RootProject[]> {
    const gradleVersionIds: string[] = [];
    return (await this.getProjectRoots()).filter((rootProject) => {
      const version = rootProject
        .getEnvironment()
        ?.getGradleEnvironment()
        ?.getGradleVersion();
      if (version === undefined) {
        return false;
      }
      if (!gradleVersionIds.includes(version)) {
        gradleVersionIds.push(version);
        return true;
      }
      return false;
    });
  }

  public clear(fireOnDidChange = true): void {
    super.clear(fireOnDidChange);
    this.isPopulated = false;
  }
}
