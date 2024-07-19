// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as net from "net";
import * as path from "path";
import * as vscode from "vscode";
import { DidChangeConfigurationNotification, LanguageClientOptions } from "vscode-languageclient";
import { LanguageClient, StreamInfo } from "vscode-languageclient/node";
import { GradleBuildContentProvider } from "../client/GradleBuildContentProvider";
import { GradleBuild, GradleProject } from "../proto/gradle_pb";
import { RootProjectsStore } from "../stores";
import {
    checkEnvJavaExecutable,
    getConfigJavaImportGradleHome,
    getConfigJavaImportGradleUserHome,
    getConfigJavaImportGradleVersion,
    getConfigJavaImportGradleWrapperEnabled,
    findValidJavaHome,
    getJavaExecutablePathFromJavaHome,
} from "../util/config";
import { prepareLanguageServerParams } from "./utils";
const CHANNEL_NAME = "Gradle for Java (Language Server)";

export let isLanguageServerStarted = false;

export async function startLanguageServer(
    context: vscode.ExtensionContext,
    contentProvider: GradleBuildContentProvider,
    rootProjectsStore: RootProjectsStore
): Promise<void> {
    void vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, (progress) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return new Promise<void>(async (resolve, reject) => {
            progress.report({
                message: "Initializing Gradle Language Server",
            });
            const clientOptions: LanguageClientOptions = {
                documentSelector: [{ scheme: "file", language: "gradle" }],
                outputChannel: vscode.window.createOutputChannel(CHANNEL_NAME),
                outputChannelName: CHANNEL_NAME,
                initializationOptions: {
                    settings: getGradleSettings(),
                },
            };
            let serverOptions;
            if (process.env.VSCODE_DEBUG_LANGUAGE_SERVER === "true") {
                // debug mode
                const port = process.env.VSCODE_GRADLE_PORT;
                if (!port) {
                    void vscode.window.showErrorMessage(
                        "VSCODE_GRADLE_PORT is invalid, please check it in launch.json."
                    );
                    return;
                }
                serverOptions = awaitServerConnection.bind(null, port);
            } else {
                // keep consistent with gRPC server
                const javaHome = await findValidJavaHome();
                let javaCommand;
                if (javaHome) {
                    javaCommand = getJavaExecutablePathFromJavaHome(javaHome);
                } else {
                    if (!checkEnvJavaExecutable()) {
                        // we have already show error message in gRPC server for no java executable found, so here we will just reject and return
                        return reject();
                    }
                    javaCommand = "java";
                }
                const args = [
                    ...prepareLanguageServerParams(),
                    "-jar",
                    path.resolve(context.extensionPath, "lib", "gradle-language-server.jar"),
                ];
                serverOptions = {
                    command: javaCommand,
                    args: args,
                };
            }
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

async function awaitServerConnection(port: string): Promise<StreamInfo> {
    const addr = parseInt(port);
    return new Promise((resolve, reject) => {
        const server = net.createServer((stream) => {
            server.close();
            resolve({ reader: stream, writer: stream });
        });
        server.on("error", reject);
        server.listen(addr, () => {
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
