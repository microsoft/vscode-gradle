// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GradleBuildContentProvider } from "../client/GradleBuildContentProvider";
import { findGradleProjectFromBuild } from "../client/utils";
import { RootProject } from "../rootProject";
import { getDependencyConfigurationTreeItems } from "../views/gradleTasks/DependencyUtils";
import { HintItem } from "../views/gradleTasks/HintItem";
import { ProjectDependencyTreeItem } from "../views/gradleTasks/ProjectDependencyTreeItem";

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
        const noDependencies = GradleDependencyProvider.getNoDependencies();
        this.cachedDependencies.set(projectPath, noDependencies);
        return noDependencies;
    }

    public static getNoDependencies(): vscode.TreeItem[] {
        return [new HintItem("No dependencies")];
    }
}
