// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as path from 'path';
import { GradleClient } from '../client';
import { isLanguageServerStarted } from '../languageServer/languageServer';
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
      await this.syncLanguageServer(projectContent);
    }
    return projectContent;
  }

  private async syncLanguageServer(
    projectContent: GetProjectsReply
  ): Promise<void> {
    if (isLanguageServerStarted) {
      await vscode.commands.executeCommand(
        'gradle.setPlugins',
        projectContent.getPluginsList()
      );
      const closures = projectContent.getPluginclosuresList().map((value) => {
        const JSONMethod = value.getMethodsList().map((method) => {
          return {
            name: method.getName(),
            parameterTypes: method.getParametertypesList(),
          };
        });
        return {
          name: value.getName(),
          methods: JSONMethod,
          fields: value.getFieldsList(),
        };
      });
      await vscode.commands.executeCommand('gradle.setClosures', closures);
    }
  }

  public handleLanguageServerStart(): void {
    if (isLanguageServerStarted) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders?.length) {
        // TODO: support multiple workspaces
        const projectPath = folders[0].uri.fsPath;
        void this.getProjectContent(projectPath, path.basename(projectPath));
      }
    }
  }

  public refresh(): void {
    this.cachedContent.clear();
  }
}
