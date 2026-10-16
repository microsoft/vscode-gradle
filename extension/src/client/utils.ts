// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GradleBuild, GradleProject } from "../proto/gradle_pb";
import { RootProject } from "../rootProject";
import { RootProjectsStore } from "../stores";

export function findGradleProjectFromBuild(projectPath: string, gradleBuild: GradleBuild): GradleProject | undefined {
    const rootProject = gradleBuild.getProject();
    if (!rootProject || !rootProject.getIsRoot()) {
        return undefined;
    }
    return findGradleProject(projectPath, rootProject);
}

function findGradleProject(projectPath: string, project: GradleProject): GradleProject | undefined {
    if (vscode.Uri.file(project.getProjectpath()).fsPath === projectPath) {
        return project;
    }
    for (const subProject of project.getProjectsList()) {
        const result = findGradleProject(projectPath, subProject);
        if (result) {
            return result;
        }
    }
    return undefined;
}

/**
 * The root project that contains the path. Root projects can be nested, the closest one is returned.
 */
export async function findRootProject(
    rootProjectStore: RootProjectsStore,
    projectPath: string
): Promise<RootProject | undefined> {
    let found: RootProject | undefined;
    for (const rootProject of await rootProjectStore.getProjectRoots()) {
        if (
            rootProject.contains(projectPath) &&
            (!found || rootProject.getProjectUri().fsPath.length > found.getProjectUri().fsPath.length)
        ) {
            found = rootProject;
        }
    }
    return found;
}
