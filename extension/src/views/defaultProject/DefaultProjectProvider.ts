// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { TaskServerClient } from "../../client";
import { isLanguageServerStarted } from "../../languageServer/languageServer";
import { RootProject } from "../../rootProject";
import { GradleTaskDefinition } from "../../tasks";
import { buildTaskId, createTaskFromDefinition } from "../../tasks/taskUtil";
import { DependencyConfigurationTreeItem } from "../gradleTasks/DependencyConfigurationTreeItem";
import { DependencyTreeItem } from "../gradleTasks/DependencyTreeItem";
import { HintItem } from "../gradleTasks/HintItem";
import { ProjectDependencyTreeItem } from "../gradleTasks/ProjectDependencyTreeItem";
import { generateDefaultTaskDefinitions } from "./DefaultProjectUtils";
import { DefaultDependencyItem, DefaultTaskDefinition } from "./types";

export class DefaultProjectProvider {
    private static defaultTaskDefinitions: DefaultTaskDefinition[] = generateDefaultTaskDefinitions();

    constructor() {
        this.defaultTasks = [];
        this.defaultDependencies = new Map();
    }

    private defaultTasks: vscode.Task[];
    private defaultDependencies: Map<string, vscode.TreeItem[]>;

    public refresh(): void {
        this.defaultTasks = [];
    }

    public async getDefaultTasks(rootProjects: RootProject[], client: TaskServerClient): Promise<vscode.Task[]> {
        if (this.defaultTasks.length) {
            return this.defaultTasks;
        }
        const tasks = [];
        for (const rootProject of rootProjects) {
            for (const defaultTaskDefinition of DefaultProjectProvider.defaultTaskDefinitions) {
                tasks.push(
                    createTaskFromDefinition(
                        this.generateDefaultTaskDefinition(
                            rootProject,
                            defaultTaskDefinition.name,
                            rootProject.getWorkspaceFolder().name,
                            path.join(rootProject.getProjectUri().fsPath, "build.gradle"),
                            defaultTaskDefinition.description,
                            defaultTaskDefinition.group
                        ),
                        rootProject,
                        client
                    )
                );
            }
        }
        this.defaultTasks = tasks;
        return tasks;
    }

    private generateDefaultTaskDefinition(
        rootProject: RootProject,
        script: string,
        projectName: string,
        projectFile: string,
        description: string,
        group?: string
    ): Required<GradleTaskDefinition> {
        return {
            type: "gradle",
            id: buildTaskId(rootProject.getProjectUri().fsPath, script, projectName),
            script,
            description: description,
            group: (group || "other").toLowerCase(),
            project: projectName,
            buildFile: projectFile,
            rootProject: projectName,
            projectFolder: rootProject.getProjectUri().fsPath,
            workspaceFolder: rootProject.getWorkspaceFolder().uri.fsPath,
            debuggable: false,
            args: "",
            javaDebug: false,
            isPinned: false,
        };
    }

    public async getDefaultDependencyItems(element: ProjectDependencyTreeItem): Promise<vscode.TreeItem[]> {
        const configurationMap: Map<string, DependencyConfigurationTreeItem> = new Map();
        const buildFileUri = vscode.Uri.file(
            // Due to no project knowledge, we only get informations from project root's build.gradle
            path.join(element.projectPath, "build.gradle")
        );
        if (!isLanguageServerStarted) {
            return [new HintItem("No dependencies")];
        }
        const dependencyItems = await vscode.commands.executeCommand<DefaultDependencyItem[]>(
            "gradle.getDependencies",
            buildFileUri.toString()
        );
        if (!dependencyItems) {
            return [new HintItem("No dependencies")];
        }
        for (const dependencyItem of dependencyItems) {
            const configuration = dependencyItem.configuration;
            if (!configurationMap.has(configuration)) {
                const configItem: DependencyConfigurationTreeItem = new DependencyConfigurationTreeItem(
                    dependencyItem.configuration,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element
                );
                configurationMap.set(configuration, configItem);
            }
            const configurationItem = configurationMap.get(configuration);
            if (!configurationItem) {
                continue;
            }
            const dependencyTreeItem: DependencyTreeItem = new DependencyTreeItem(
                dependencyItem.name,
                vscode.TreeItemCollapsibleState.None,
                configurationItem
            );
            dependencyTreeItem.command = {
                title: "Show Dependency",
                command: "vscode.open",
                arguments: [
                    buildFileUri,
                    {
                        selection: dependencyItem.range,
                    } as vscode.TextDocumentShowOptions,
                ],
            };
            configurationItem.getChildren().push(dependencyTreeItem);
        }
        this.defaultDependencies.set(buildFileUri.toString(), Array.from(configurationMap.values()));
        return this.defaultDependencies.get(buildFileUri.toString()) || [];
    }
}
