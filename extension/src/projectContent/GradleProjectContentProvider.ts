// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { GradleClient } from '../client';
import { syncLanguageServer } from '../languageServer/languageServer';
import { GetProjectsReply } from '../proto/gradle_pb';
import { getGradleConfig } from '../util/config';

export class GradleProjectContentProvider {
  private cachedContent: Map<string, GetProjectsReply> = new Map();

  constructor(private readonly client: GradleClient) {}

  public async getProjectContent(
    projectPath: string,
    projectName: string
  ): Promise<GetProjectsReply | undefined> {
    if (this.cachedContent.has(projectPath)) {
      return this.cachedContent.get(projectPath);
    }
    const projectContent = await this.client.getProjects(
      projectPath,
      getGradleConfig(),
      projectName
    );
    if (projectContent) {
      this.cachedContent.set(projectPath, projectContent);
      await syncLanguageServer(projectContent);
    }
    return projectContent;
  }

  public refresh(): void {
    this.cachedContent.clear();
  }
}
