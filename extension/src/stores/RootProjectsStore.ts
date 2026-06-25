import * as vscode from "vscode";
import * as path from "path";
import { getNestedProjectsConfig } from "../util/config";
import { StoreMap } from ".";
import { isGradleRootProject } from "../util";
import { RootProject } from "../rootProject/RootProject";
import { GRADLE_BUILD_FILE_NAMES } from "../constant";

const GRADLE_DEFAULT_BUILD_FILE_NAMES = ["build.gradle", "build.gradle.kts"];
const GRADLE_SETTINGS_FILE_NAMES = ["settings.gradle", "settings.gradle.kts"];

function hasAncestorFolder(folder: string, ancestorFolders: Set<string>): boolean {
    let current = folder;
    let parent = path.dirname(current);
    while (parent !== current) {
        if (ancestorFolders.has(parent)) {
            return true;
        }
        current = parent;
        parent = path.dirname(current);
    }
    return false;
}

async function getNestedRootProjectFolders(): Promise<string[]> {
    const matchingNestedSettingsFiles = await vscode.workspace.findFiles(
        `**/{${GRADLE_SETTINGS_FILE_NAMES.join(",")}}`
    );
    const nestedSettingsFolders = new Set(matchingNestedSettingsFiles.map((uri) => path.dirname(uri.fsPath)));
    const matchingNestedBuildFiles = await vscode.workspace.findFiles(
        `**/{${GRADLE_DEFAULT_BUILD_FILE_NAMES.join(",")}}`
    );
    const standaloneNestedBuildFolders = matchingNestedBuildFiles
        .map((uri) => path.dirname(uri.fsPath))
        .filter((folder) => !hasAncestorFolder(folder, nestedSettingsFolders));
    return [...new Set([...nestedSettingsFolders, ...standaloneNestedBuildFolders])];
}

function buildRootFolder(folderUri: vscode.Uri): RootProject {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri)!;
    return new RootProject(workspaceFolder, folderUri);
}

function getGradleProjectFoldersOutsideRoot(
    configNestedFolders: boolean | ReadonlyArray<string>,
    gradleProjectFolders: string[],
    workspaceFolder: vscode.WorkspaceFolder
): string[] {
    if (configNestedFolders === true) {
        return gradleProjectFolders.filter((projectFolder) => projectFolder !== workspaceFolder.uri.fsPath);
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
        const workspaceFolders: ReadonlyArray<vscode.WorkspaceFolder> = vscode.workspace.workspaceFolders || [];
        const gradleProjectFolders = await getNestedRootProjectFolders();

        for (const workspaceFolder of workspaceFolders) {
            const configNestedFolders = getNestedProjectsConfig(workspaceFolder);
            const gradleProjectFoldersOutsideRoot = getGradleProjectFoldersOutsideRoot(
                configNestedFolders,
                gradleProjectFolders,
                workspaceFolder
            );
            if (gradleProjectFolders.includes(workspaceFolder.uri.fsPath)) {
                const rootProject = buildRootFolder(workspaceFolder.uri);
                if (isGradleRootProject(rootProject)) {
                    this.setRootProjectFolder(rootProject);
                }
            }
            gradleProjectFoldersOutsideRoot
                .map((folder) => buildRootFolder(vscode.Uri.file(folder)))
                .forEach((project) => {
                    if (isGradleRootProject(project)) {
                        this.setRootProjectFolder(project);
                    }
                });
        }
        // for those workspace folders containing build files but no wrapper in the root,
        // we also add them to rootProjects
        for (const workspaceFolder of workspaceFolders) {
            if (await RootProjectsStore.isGradleFileExists(workspaceFolder)) {
                this.setRootProjectFolder(buildRootFolder(workspaceFolder.uri));
            }
        }
        this.isPopulated = true;
        this.fireOnDidChange(null);
    }

    private setRootProjectFolder = (rootProject: RootProject): void => {
        this.setItem(rootProject.getProjectUri().fsPath, rootProject, false);
    };

    private static async isGradleFileExists(folder: vscode.WorkspaceFolder): Promise<boolean> {
        if (
            (
                await vscode.workspace.findFiles(
                    new vscode.RelativePattern(folder, `{${GRADLE_BUILD_FILE_NAMES.join(",")}}`)
                )
            )?.length
        ) {
            return true;
        }
        return false;
    }

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
            const version = rootProject.getEnvironment()?.getGradleEnvironment()?.getGradleVersion();
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
