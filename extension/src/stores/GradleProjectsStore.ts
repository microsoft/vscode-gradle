import * as vscode from 'vscode';
import * as path from 'path';
import { getNestedProjectsConfig } from '../config';
import { StoreMap } from '.';
import { isGradleRootProject } from '../util';
import { RootProject } from '../rootProject/RootProject';

async function getNestedGradleProjectFolders(): Promise<RootProject[]> {
  const files = await vscode.workspace.findFiles(
    '**/{gradlew,gradlew.bat}',
    '/{gradlew,gradlew.bat}' // ignore root wrapper scripts
  );
  const projectFolders = [
    ...new Set(files.map((uri) => path.dirname(uri.fsPath))),
  ];
  return projectFolders.map((folder) =>
    buildGradleFolder(vscode.Uri.file(folder))
  );
}

function buildGradleFolder(folderUri: vscode.Uri): RootProject {
  return new RootProject(
    vscode.workspace.getWorkspaceFolder(folderUri)!,
    folderUri
  );
}

export class GradleProjectsStore extends StoreMap<string, RootProject> {
  private async populate(): Promise<void> {
    const workspaceFolders: ReadonlyArray<vscode.WorkspaceFolder> =
      vscode.workspace.workspaceFolders || [];
    workspaceFolders.forEach((workspaceFolder) =>
      this.setGradleProjectFolder(buildGradleFolder(workspaceFolder.uri))
    );
    for (const workspaceFolder of workspaceFolders) {
      const configNestedFolders = getNestedProjectsConfig(workspaceFolder);
      if (configNestedFolders === true) {
        (await getNestedGradleProjectFolders()).forEach(
          this.setGradleProjectFolder
        );
      } else if (Array.isArray(configNestedFolders)) {
        configNestedFolders
          .map((nestedfolder) => {
            const fsPath = path.join(workspaceFolder.uri.fsPath, nestedfolder);
            return buildGradleFolder(vscode.Uri.file(fsPath));
          })
          .forEach(this.setGradleProjectFolder);
      }
    }
    this.fireOnDidChange(null);
  }

  private setGradleProjectFolder = (rootProject: RootProject): void => {
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
        .getEnvironent()
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
