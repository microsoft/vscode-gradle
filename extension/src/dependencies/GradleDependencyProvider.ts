// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GradleBuildContentProvider } from "../client/GradleBuildContentProvider";
import { getDependencyConfigurationTreeItems } from "../views/gradleTasks/DependencyUtils";
import { HintItem } from "../views/gradleTasks/HintItem";
import { ProjectDependencyTreeItem } from "../views/gradleTasks/ProjectDependencyTreeItem";
import { RootProject } from "../rootProject";
import { findGradleProjectFromBuild } from "../client/utils";

export class GradleDependencyProvider {
    // <projectPath, configItem[]>
    private cachedDependencies: Map<string, vscode.TreeItem[]> = new Map();

    constructor(private readonly contentProvider: GradleBuildContentProvider) {}

    public async getDependencies(
        element: ProjectDependencyTreeItem,
        rootProject: RootProject
    ): Promise<vscode.TreeItem[]> {
        const projectPath = element.getProjectPath();
        if (this.cachedDependencies.has(projectPath)) {
            return this.cachedDependencies.get(projectPath)!;
        }
        const gradleBuild = await this.contentProvider.getGradleBuild(rootProject);
        if (gradleBuild) {
            const project = findGradleProjectFromBuild(projectPath, gradleBuild);
            if (project) {
                const dependencyItem = project.getDependencyitem();
                if (dependencyItem) {
                    const configItems = getDependencyConfigurationTreeItems(dependencyItem, element);
                    if (configItems) {
                        this.cachedDependencies.set(projectPath, configItems);
                        return configItems;
                    }
                }
            }
        }
        const noDependencies = [new HintItem("No dependencies")];
        this.cachedDependencies.set(projectPath, noDependencies);
        return noDependencies;
    }
}
