// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as net from "net";
import * as vscode from "vscode";
import { DidChangeConfigurationNotification, LanguageClientOptions } from "vscode-languageclient";
import { LanguageClient, StreamInfo } from "vscode-languageclient/node";
import { GradleBuildContentProvider } from "../client/GradleBuildContentProvider";
import { GradleBuild, GradleProject } from "../proto/gradle_pb";
import { RootProjectsStore } from "../stores";
import {
    getConfigJavaImportGradleHome,
    getConfigJavaImportGradleUserHome,
    getConfigJavaImportGradleVersion,
    getConfigJavaImportGradleWrapperEnabled,
} from "../util/config";

export let isLanguageServerStarted = false;

export async function startLanguageClientAndWaitForConnection(
    context: vscode.ExtensionContext,
    contentProvider: GradleBuildContentProvider,
    rootProjectsStore: RootProjectsStore,
    languageServerPipePath: string
): Promise<void> {
    if (languageServerPipePath === "") {
        isLanguageServerStarted = false;
        return;
    }
    void vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, (progress) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return new Promise<void>(async (resolve) => {
            progress.report({
                message: "Initializing Gradle Language Server",
            });
            const clientOptions: LanguageClientOptions = {
                documentSelector: [{ scheme: "file", language: "gradle" }],
                initializationOptions: {
                    settings: getGradleSettings(),
                },
            };
            const serverOptions = () => awaitServerConnection(languageServerPipePath);
            const languageClient = new LanguageClient("gradle", "Gradle Language Server", serverOptions, clientOptions);
            void languageClient.onReady().then(
                () => {
                    isLanguageServerStarted = true;
                    void handleLanguageServerStart(contentProvider, rootProjectsStore);
                    resolve();
                },
                (e) => {
                    void vscode.window.showErrorMessage(e);
                }
            );
            const disposable = languageClient.start();

            context.subscriptions.push(disposable);
            context.subscriptions.push(
                vscode.workspace.onDidChangeConfiguration((e) => {
                    if (e.affectsConfiguration("java.import.gradle")) {
                        languageClient.sendNotification(DidChangeConfigurationNotification.type, {
                            settings: getGradleSettings(),
                        });
                    }
                })
            );
        });
    });
}

async function awaitServerConnection(pipeName: string): Promise<StreamInfo> {
    return new Promise((resolve, reject) => {
        const server = net.createServer((stream) => {
            server.close();
            resolve({ reader: stream, writer: stream });
        });
        server.on("error", reject);
        server.listen(pipeName, () => {
            server.removeListener("error", reject);
        });
        return server;
    });
}

function getGradleSettings(): unknown {
    return {
        gradleHome: getConfigJavaImportGradleHome(),
        gradleVersion: getConfigJavaImportGradleVersion(),
        gradleWrapperEnabled: getConfigJavaImportGradleWrapperEnabled(),
        gradleUserHome: getConfigJavaImportGradleUserHome(),
    };
}

async function syncSingleProject(project: GradleProject): Promise<void> {
    if (isLanguageServerStarted) {
        const projectPath = vscode.Uri.file(project.getProjectpath()).fsPath;
        await vscode.commands.executeCommand("gradle.setPlugins", project.getProjectpath(), project.getPluginsList());
        const closures = project.getPluginclosuresList().map((value) => {
            const JSONMethod = value.getMethodsList().map((method) => {
                return {
                    name: method.getName(),
                    parameterTypes: method.getParametertypesList(),
                    deprecated: method.getDeprecated(),
                };
            });
            const JSONField = value.getFieldsList().map((field) => {
                return {
                    name: field.getName(),
                    deprecated: field.getDeprecated(),
                };
            });
            return {
                name: value.getName(),
                methods: JSONMethod,
                fields: JSONField,
            };
        });
        await vscode.commands.executeCommand("gradle.setClosures", projectPath, closures);
        await vscode.commands.executeCommand(
            "gradle.setScriptClasspaths",
            projectPath,
            project.getScriptclasspathsList()
        );
    }
}

async function syncProject(project: GradleProject): Promise<void> {
    await syncSingleProject(project);
    for (const subProject of project.getProjectsList()) {
        await syncProject(subProject);
    }
}

export async function syncGradleBuild(gradleBuild: GradleBuild): Promise<void> {
    const rootProject = gradleBuild.getProject();
    if (rootProject && rootProject.getIsRoot()) {
        syncProject(rootProject);
    }
}

async function handleLanguageServerStart(
    contentProvider: GradleBuildContentProvider,
    rootProjectsStore: RootProjectsStore
): Promise<void> {
    if (isLanguageServerStarted) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders?.length) {
            // TODO: support multiple workspaces
            const projectPath = folders[0].uri.fsPath;
            const rootProject = rootProjectsStore.get(projectPath);
            if (!rootProject) {
                return;
            }
            // when language server starts, it knows nothing about the project
            // here to asynchronously sync the project content (plugins, closures) with language server
            const gradleBuild = await contentProvider.getGradleBuild(rootProject);
            if (gradleBuild) {
                await syncGradleBuild(gradleBuild);
            }
        }
    }
}
