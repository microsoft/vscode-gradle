// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { GradleProjectContentProvider } from '../projectContent/GradleProjectContentProvider';
import { getDependencyConfigurationTreeItems } from '../views/gradleTasks/DependencyUtils';
import { HintItem } from '../views/gradleTasks/HintItem';
import { ProjectDependencyTreeItem } from '../views/gradleTasks/ProjectDependencyTreeItem';

export class GradleDependencyProvider {
  // <projectPath, configItem[]>
  private cachedDependencies: Map<string, vscode.TreeItem[]> = new Map();

  constructor(private readonly contentProvider: GradleProjectContentProvider) {}

  public async getDependencies(
    element: ProjectDependencyTreeItem
  ): Promise<vscode.TreeItem[]> {
    const projectPath = element.getProjectPath();
    if (this.cachedDependencies.has(projectPath)) {
      return this.cachedDependencies.get(projectPath)!;
    }
    const project = await this.contentProvider.getProjectContent(
      projectPath,
      element.getProjectName()
    );
    if (!project) {
      const noDependencies = [new HintItem('No dependencies')];
      this.cachedDependencies.set(projectPath, noDependencies);
      return noDependencies;
    }
    const dependencyItem = project.getItem();
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
    const noDependencies = [new HintItem('No dependencies')];
    this.cachedDependencies.set(projectPath, noDependencies);
    return noDependencies;
  }
}
