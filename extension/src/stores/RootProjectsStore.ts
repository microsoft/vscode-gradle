import * as vscode from 'vscode';
import * as path from 'path';
import { getNestedProjectsConfig, getConfigJavaDebug } from '../config';
import { StoreMap } from '.';
import { isGradleRootProject } from '../util';
import { RootProject } from '../rootProject/RootProject';

async function getNestedRootProjectFolders(): Promise<RootProject[]> {
  const files = await vscode.workspace.findFiles(
    '**/{gradlew,gradlew.bat}',
    '/{gradlew,gradlew.bat}' // ignore root wrapper scripts
  );
  const projectFolders = [
    ...new Set(files.map((uri) => path.dirname(uri.fsPath))),
  ];
  return projectFolders.map((folder) =>
    buildRootFolder(vscode.Uri.file(folder))
  );
}

function buildRootFolder(folderUri: vscode.Uri): RootProject {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri)!;
  const javaDebug = getConfigJavaDebug(workspaceFolder);
  return new RootProject(workspaceFolder, folderUri, javaDebug);
}

export class RootProjectsStore extends StoreMap<string, RootProject> {
  private async populate(): Promise<void> {
    const workspaceFolders: ReadonlyArray<vscode.WorkspaceFolder> =
      vscode.workspace.workspaceFolders || [];
    workspaceFolders.forEach((workspaceFolder) =>
      this.setRootProjectFolder(buildRootFolder(workspaceFolder.uri))
    );
    for (const workspaceFolder of workspaceFolders) {
      const configNestedFolders = getNestedProjectsConfig(workspaceFolder);
      if (configNestedFolders === true) {
        (await getNestedRootProjectFolders()).forEach(
          this.setRootProjectFolder
        );
      } else if (Array.isArray(configNestedFolders)) {
        configNestedFolders
          .map((nestedfolder) => {
            const fsPath = path.join(workspaceFolder.uri.fsPath, nestedfolder);
            return buildRootFolder(vscode.Uri.file(fsPath));
          })
          .forEach(this.setRootProjectFolder);
      }
    }
    this.fireOnDidChange(null);
  }

  private setRootProjectFolder = (rootProject: RootProject): void => {
    if (isGradleRootProject(rootProject)) {
      this.setItem(rootProject.getProjectUri().fsPath, rootProject, false);
    }
  };

  public async buildAndGetProjectRoots(): Promise<RootProject[]> {
    if (!this.getData().size) {
      await this.populate();
    }
    return [...this.getData().values()];
  }

  public async buildAndGetProjectRootsWithUniqueVersions(): Promise<
    RootProject[]
  > {
    const gradleVersionIds: string[] = [];
    return (await this.buildAndGetProjectRoots()).filter((rootProject) => {
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
}
