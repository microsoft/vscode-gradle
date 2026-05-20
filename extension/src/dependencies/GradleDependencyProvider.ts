// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { TaskServerClient } from "../client";
import { getProjectDependenciesCancellationKey } from "../client/CancellationKeys";
import { RootProject } from "../rootProject";
import { getGradleConfig } from "../util/config";
import { normalizeGradleProjectPath } from "../util/gradlePath";
import { getDependencyConfigurationTreeItems } from "../views/gradleTasks/DependencyUtils";
import { HintItem } from "../views/gradleTasks/HintItem";
import { ProjectDependencyTreeItem } from "../views/gradleTasks/ProjectDependencyTreeItem";

const COMMAND_CANCEL_DEPENDENCY_LOADING = "gradle.cancelDependencyLoading";
const COMMAND_RELOAD_DEPENDENCIES = "gradle.reloadDependencies";

export class GradleDependencyProvider {
    // <projectPath, configItem[]>
    private cachedDependencies: Map<string, vscode.TreeItem[]> = new Map();
    private cancelledDependencies: Set<string> = new Set();
    private loadingDependencies: Map<string, Promise<void>> = new Map();
    private loadVersions: Map<string, number> = new Map();
    private dependencyCacheKeys: WeakMap<ProjectDependencyTreeItem, string> = new WeakMap();
    private loadingDependencyCancellationKeys: Map<string, string> = new Map();
    private readonly _onDidChangeDependencyTreeItem = new vscode.EventEmitter<vscode.TreeItem>();
    private nextLoadVersion = 0;

    constructor(private readonly client: TaskServerClient) {}

    public onDidChangeDependencyTreeItem(refreshTreeItem: (treeItem: vscode.TreeItem) => void): vscode.Disposable {
        return this._onDidChangeDependencyTreeItem.event(refreshTreeItem);
    }

    public async getDependencies(
        element: ProjectDependencyTreeItem,
        rootProject: RootProject
    ): Promise<vscode.TreeItem[]> {
        const gradleProjectPath = normalizeGradleProjectPath(element.getGradleProjectPath());
        const cacheKey = `${rootProject.getProjectUri().fsPath}:${gradleProjectPath}`;
        this.dependencyCacheKeys.set(element, cacheKey);
        if (this.cachedDependencies.has(cacheKey)) {
            return this.cachedDependencies.get(cacheKey)!;
        }

        if (this.cancelledDependencies.has(cacheKey)) {
            return [this.getCancelledDependencyTreeItem(element)];
        }

        const cancellationKey = getProjectDependenciesCancellationKey(
            rootProject.getProjectUri().fsPath,
            gradleProjectPath
        );

        if (!this.loadingDependencies.has(cacheKey)) {
            const loadVersion = this.createLoadVersion(cacheKey);
            const dependencyLoad = this.loadDependencies(
                element,
                rootProject,
                gradleProjectPath,
                cacheKey,
                loadVersion
            ).finally(() => {
                if (this.loadingDependencies.get(cacheKey) === dependencyLoad) {
                    this.loadingDependencies.delete(cacheKey);
                }
            });
            this.loadingDependencies.set(cacheKey, dependencyLoad);
        }

        this.setLoading(element, cacheKey, cancellationKey);
        return [this.getLoadingDependencyTreeItem(element)];
    }

    public async cancelDependencies(element: ProjectDependencyTreeItem): Promise<void> {
        const cacheKey = this.dependencyCacheKeys.get(element);
        if (!cacheKey) {
            return;
        }
        const cancellationKey = this.loadingDependencyCancellationKeys.get(cacheKey);
        if (cancellationKey) {
            this.cancelledDependencies.add(cacheKey);
            await this.client.cancelProjectDependencies(cancellationKey);
        }
    }

    public reloadDependencies(element: ProjectDependencyTreeItem): void {
        const cacheKey = this.dependencyCacheKeys.get(element);
        if (cacheKey) {
            this.invalidateLoad(cacheKey);
            this.loadingDependencies.delete(cacheKey);
            this.cachedDependencies.delete(cacheKey);
            this.cancelledDependencies.delete(cacheKey);
        }
        this._onDidChangeDependencyTreeItem.fire(element);
    }

    public clearCache(): void {
        this.cachedDependencies.clear();
        this.cancelledDependencies.clear();
        this.loadingDependencies.clear();
        this.loadVersions.clear();
        this.loadingDependencyCancellationKeys.clear();
    }

    public static getNoDependencies(): vscode.TreeItem[] {
        return [new HintItem("No dependencies")];
    }

    private createLoadVersion(cacheKey: string): number {
        const loadVersion = ++this.nextLoadVersion;
        this.loadVersions.set(cacheKey, loadVersion);
        return loadVersion;
    }

    private invalidateLoad(cacheKey: string): void {
        this.loadVersions.set(cacheKey, ++this.nextLoadVersion);
    }

    private isCurrentLoad(cacheKey: string, loadVersion: number): boolean {
        return this.loadVersions.get(cacheKey) === loadVersion;
    }

    private async loadDependencies(
        element: ProjectDependencyTreeItem,
        rootProject: RootProject,
        gradleProjectPath: string,
        cacheKey: string,
        loadVersion: number
    ): Promise<void> {
        try {
            const dependencyItem = await this.client.getProjectDependencies(
                rootProject,
                gradleProjectPath,
                getGradleConfig()
            );
            if (!this.isCurrentLoad(cacheKey, loadVersion) || this.cancelledDependencies.has(cacheKey)) {
                return;
            }
            if (dependencyItem) {
                const configItems = getDependencyConfigurationTreeItems(dependencyItem, element);
                if (configItems) {
                    this.cachedDependencies.set(cacheKey, configItems);
                    return;
                }
            }

            this.cachedDependencies.set(cacheKey, GradleDependencyProvider.getNoDependencies());
        } catch {
            if (!this.isCurrentLoad(cacheKey, loadVersion) || this.cancelledDependencies.has(cacheKey)) {
                return;
            }
            this.cachedDependencies.set(cacheKey, [new HintItem("Failed to load dependencies")]);
        } finally {
            if (this.isCurrentLoad(cacheKey, loadVersion)) {
                this.setLoading(element, cacheKey, undefined);
            }
        }
    }

    private getLoadingDependencyTreeItem(parent: ProjectDependencyTreeItem): vscode.TreeItem {
        const item = new vscode.TreeItem("Loading dependencies", vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("loading~spin");
        item.tooltip = "Cancel loading dependencies";
        item.command = {
            command: COMMAND_CANCEL_DEPENDENCY_LOADING,
            title: "Cancel Loading Dependencies",
            arguments: [parent],
        };
        return item;
    }

    private getCancelledDependencyTreeItem(parent: ProjectDependencyTreeItem): vscode.TreeItem {
        const item = new vscode.TreeItem("Loading cancelled", vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("refresh");
        item.tooltip = "Reload dependencies";
        item.command = {
            command: COMMAND_RELOAD_DEPENDENCIES,
            title: "Reload Dependencies",
            arguments: [parent],
        };
        return item;
    }

    private setLoading(
        element: ProjectDependencyTreeItem,
        cacheKey: string,
        cancellationKey: string | undefined
    ): void {
        if (cancellationKey) {
            if (this.loadingDependencyCancellationKeys.get(cacheKey) === cancellationKey) {
                return;
            }
            this.loadingDependencyCancellationKeys.set(cacheKey, cancellationKey);
            element.setLoading(true);
        } else {
            if (!this.loadingDependencyCancellationKeys.has(cacheKey)) {
                return;
            }
            this.loadingDependencyCancellationKeys.delete(cacheKey);
            element.setLoading(false);
        }
        this._onDidChangeDependencyTreeItem.fire(element);
    }
}
