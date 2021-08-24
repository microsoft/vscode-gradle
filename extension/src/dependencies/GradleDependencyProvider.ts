// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { GradleClient } from '../client';
import { getGradleConfig } from '../util/config';
import { getDependencyConfigurationTreeItems } from '../views/gradleTasks/DependencyUtils';
import { HintItem } from '../views/gradleTasks/HintItem';
import { ProjectDependencyTreeItem } from '../views/gradleTasks/ProjectDependencyTreeItem';

export class GradleDependencyProvider {
  // <projectPath, configItem[]>
  private cachedDependencies: Map<string, vscode.TreeItem[]> = new Map();

  constructor(private readonly client: GradleClient) {}

  public async getDependencies(
    element: ProjectDependencyTreeItem
  ): Promise<vscode.TreeItem[]> {
    const projectPath = element.getProjectPath();
    if (this.cachedDependencies.has(projectPath)) {
      return this.cachedDependencies.get(projectPath)!;
    }
    const dependencyItem = await this.client.getDependencies(
      projectPath,
      getGradleConfig(),
      element.getProjectName()
    );
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

  public clearDependenciesCache(): void {
    this.cachedDependencies.clear();
  }
}
