import * as vscode from "vscode";
import * as path from "path";
import { getNestedProjectsConfig } from "../util/config";
import { StoreMap } from ".";
import { hasGradleMarkerFile } from "../util";
import { RootProject } from "../rootProject/RootProject";
import { GRADLE_BUILD_FILE_NAMES } from "../constant";

const GRADLE_DEFAULT_BUILD_FILE_NAMES = GRADLE_BUILD_FILE_NAMES.filter((fileName) =>
    fileName.startsWith("build.gradle")
);
const GRADLE_SETTINGS_FILE_NAMES = GRADLE_BUILD_FILE_NAMES.filter((fileName) => fileName.startsWith("settings.gradle"));

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
    workspaceFolder: vscode.WorkspaceFolder,
    includeDiscoveredNestedProjects: boolean
): string[] {
    if (Array.isArray(configNestedFolders)) {
        return configNestedFolders.map((nestedfolder) => {
            return path.join(workspaceFolder.uri.fsPath, nestedfolder);
        });
    } else if (configNestedFolders === true || includeDiscoveredNestedProjects) {
        const workspaceRoot = workspaceFolder.uri.fsPath;
        return gradleProjectFolders.filter(
            (projectFolder) =>
                projectFolder !== workspaceRoot && hasAncestorFolder(projectFolder, new Set([workspaceRoot]))
        );
    }
    return [];
}

export class RootProjectsStore extends StoreMap<string, RootProject> {
    private isPopulated = false;
    private populatePromise: Promise<void> | undefined = undefined;

    public async populate(): Promise<void> {
        const workspaceFolders: ReadonlyArray<vscode.WorkspaceFolder> = vscode.workspace.workspaceFolders || [];
        const workspaceContexts = workspaceFolders.map((workspaceFolder) => {
            const rootProject = buildRootFolder(workspaceFolder.uri);
            return {
                workspaceFolder,
                rootProject,
                configNestedFolders: getNestedProjectsConfig(workspaceFolder),
                hasRootGradleMarker: hasGradleMarkerFile(rootProject),
            };
        });
        let gradleProjectFolders: string[] | undefined;
        const getGradleProjectFolders = async (): Promise<string[]> => {
            if (!gradleProjectFolders) {
                gradleProjectFolders = await getNestedRootProjectFolders();
            }
            return gradleProjectFolders;
        };

        for (const { workspaceFolder, rootProject, configNestedFolders, hasRootGradleMarker } of workspaceContexts) {
            if (hasRootGradleMarker) {
                this.setRootProjectFolder(rootProject);
            }
            const shouldDiscoverNestedProjects = configNestedFolders === true;
            const gradleProjectFoldersOutsideRoot = getGradleProjectFoldersOutsideRoot(
                configNestedFolders,
                shouldDiscoverNestedProjects ? await getGradleProjectFolders() : [],
                workspaceFolder,
                shouldDiscoverNestedProjects
            );
            gradleProjectFoldersOutsideRoot
                .map((folder) => buildRootFolder(vscode.Uri.file(folder)))
                .forEach((project) => {
                    if (hasGradleMarkerFile(project)) {
                        this.setRootProjectFolder(project);
                    }
                });
        }
        this.isPopulated = true;
        this.fireOnDidChange(null);
    }

    private setRootProjectFolder = (rootProject: RootProject): void => {
        this.setItem(rootProject.getProjectUri().fsPath, rootProject, false);
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
