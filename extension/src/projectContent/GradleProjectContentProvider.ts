// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GradleClient } from "../client";
import { GetProjectsReply } from "../proto/gradle_pb";
import { getGradleConfig } from "../util/config";

export class GradleProjectContentProvider {
    private cachedContent: Map<string, GetProjectsReply> = new Map();

    constructor(private readonly client: GradleClient) {}

    public async getProjectContent(projectPath: string): Promise<GetProjectsReply | undefined> {
        const realPath = vscode.Uri.file(projectPath).fsPath;
        if (this.cachedContent.has(realPath)) {
            return this.cachedContent.get(realPath);
        }
        const projectContent = await this.client.getProjects(realPath, getGradleConfig());
        if (projectContent) {
            this.cachedContent.set(realPath, projectContent);
        }
        return projectContent;
    }

    public refresh(): void {
        this.cachedContent.clear();
    }
}
