// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { GradleBuildContentProvider } from '../client/GradleBuildContentProvider';
import { getDependencyConfigurationTreeItems } from '../views/gradleTasks/DependencyUtils';
import { HintItem } from '../views/gradleTasks/HintItem';
import { ProjectDependencyTreeItem } from '../views/gradleTasks/ProjectDependencyTreeItem';
import { RootProject } from '../rootProject';

export class GradleDependencyProvider {
  // <projectPath, configItem[]>
  private cachedDependencies: Map<string, vscode.TreeItem[]> = new Map();

  constructor(private readonly contentProvider: GradleBuildContentProvider) {}

  public async getDependencies(
    element: ProjectDependencyTreeItem,
    RootProject: RootProject
  ): Promise<vscode.TreeItem[]> {
    const projectPath = element.getProjectPath();
    if (this.cachedDependencies.has(projectPath)) {
      return this.cachedDependencies.get(projectPath)!;
    }
    const gradleBuild = await this.contentProvider.getGradleBuild(RootProject);
    if (gradleBuild) {
      const dependencyItem = gradleBuild
        .getProjectcontent()
        ?.getDependencyitem();
      if (dependencyItem) {
        const configItems = getDependencyConfigurationTreeItems(
          dependencyItem,
          element
        );
        if (configItems) {
          this.cachedDependencies.set(projectPath, configItems);
          return configItems;
        }
      }
    }
    const noDependencies = [new HintItem('No dependencies')];
    this.cachedDependencies.set(projectPath, noDependencies);
    return noDependencies;
  }
}
