// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import AwaitLock from "await-lock";
import { TaskServerClient } from ".";
import { syncGradleBuild } from "../languageServer/languageServer";
import { GradleBuild } from "../proto/gradle_pb";
import { RootProject } from "../rootProject";
import { getGradleConfig } from "../util/config";

const lock = new AwaitLock();

export class GradleBuildContentProvider {
    private cachedBuild: Map<string, GradleBuild> = new Map();

    constructor(private readonly client: TaskServerClient) {}

    public async getGradleBuild(rootProject: RootProject): Promise<GradleBuild | undefined> {
        await lock.acquireAsync();
        try {
            const projectPath = rootProject.getProjectUri().fsPath;
            if (this.cachedBuild.has(projectPath)) {
                return this.cachedBuild.get(projectPath);
            }
            const gradleBuild = await this.client.getBuild(rootProject, getGradleConfig());
            if (gradleBuild) {
                await syncGradleBuild(gradleBuild);
                this.cachedBuild.set(projectPath, gradleBuild);
            }
            return gradleBuild;
        } finally {
            lock.release();
        }
    }

    public refresh(): void {
        this.cachedBuild.clear();
    }

    public getCachedBuild(): Map<string, GradleBuild> {
        return this.cachedBuild;
    }
}
