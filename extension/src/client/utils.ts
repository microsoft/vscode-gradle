// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { GradleBuild, GradleProject } from "../proto/gradle_pb";

export function findGradleProjectFromBuild(projectPath: string, gradleBuild: GradleBuild): GradleProject | undefined {
    const rootProject = gradleBuild.getProject();
    if (!rootProject || rootProject.getIsRoot()) {
        return undefined;
    }
    return findGradleProject(projectPath, rootProject);
}

function findGradleProject(projectPath: string, project: GradleProject): GradleProject | undefined {
    if (project.getProjectpath() === projectPath) {
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
