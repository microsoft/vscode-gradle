// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { GradleClient } from '.';
import { GradleBuild } from '../proto/gradle_pb';
import { RootProject } from '../rootProject';
import { getGradleConfig } from '../util/config';

export class GradleBuildContentProvider {
  private cachedBuild: Map<string, GradleBuild> = new Map();

  constructor(private readonly client: GradleClient) {}

  public async getGradleBuild(
    rootProject: RootProject
  ): Promise<GradleBuild | undefined> {
    const projectPath = rootProject.getProjectUri().fsPath;
    if (this.cachedBuild.has(projectPath)) {
      return this.cachedBuild.get(projectPath);
    }
    const gradleBuild = await this.client.getBuild(
      rootProject,
      getGradleConfig()
    );
    if (gradleBuild) {
      this.cachedBuild.set(projectPath, gradleBuild);
    }
    return gradleBuild;
  }

  public refresh(): void {
    this.cachedBuild.clear();
  }
}
