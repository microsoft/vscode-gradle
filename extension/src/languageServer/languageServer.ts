// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as net from "net";
import * as vscode from "vscode";
import {
    CloseAction,
    DidChangeConfigurationNotification,
    ErrorAction,
    LanguageClientOptions,
} from "vscode-languageclient";
import { LanguageClient, StreamInfo } from "vscode-languageclient/node";
import { GradleBuildContentProvider } from "../client/GradleBuildContentProvider";
import { GradleBuild, GradleProject } from "../proto/gradle_pb";
import { logger } from "../logger";
import { RootProjectsStore } from "../stores";
import {
    getConfigJavaImportGradleHome,
    getConfigJavaImportGradleUserHome,
    getConfigJavaImportGradleVersion,
    getConfigJavaImportGradleWrapperEnabled,
} from "../util/config";

export let isLanguageServerStarted = false;
let activeLanguageClient: LanguageClient | undefined;
let languageClientDisposable: vscode.Disposable | undefined;
let configurationDisposable: vscode.Disposable | undefined;
let pendingPipeServer: vscode.Disposable | undefined;
let cleanupDisposableRegistered = false;

export async function startLanguageClientAndWaitForConnection(
    context: vscode.ExtensionContext,
    contentProvider: GradleBuildContentProvider,
    rootProjectsStore: RootProjectsStore,
    languageServerPipePath: string
): Promise<void> {
    registerLanguageServerCleanup(context);
    if (languageServerPipePath === "") {
        isLanguageServerStarted = false;
        return;
    }
    stopLanguageClient();
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, async (progress) => {
        progress.report({
            message: "Initializing Gradle Language Server",
        });
        const pipeServer = createLanguageServerPipeServer(languageServerPipePath);
        pendingPipeServer = pipeServer;
        await pipeServer.listening;
        const currentDisposables: {
            client?: vscode.Disposable;
            configuration?: vscode.Disposable;
        } = {};
        const cleanupClosedClient = (): void => {
            if (languageClientDisposable === currentDisposables.client) {
                activeLanguageClient = undefined;
                languageClientDisposable = undefined;
                isLanguageServerStarted = false;
            }
            if (configurationDisposable && configurationDisposable === currentDisposables.configuration) {
                const disposable = configurationDisposable;
                configurationDisposable = undefined;
                disposable.dispose();
            }
            if (pendingPipeServer === pipeServer) {
                pendingPipeServer.dispose();
                pendingPipeServer = undefined;
            }
        };
        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: "file", language: "gradle" }],
            errorHandler: {
                error: () => ErrorAction.Continue,
                closed: () => {
                    cleanupClosedClient();
                    return CloseAction.DoNotRestart;
                },
            },
            initializationOptions: {
                settings: getGradleSettings(),
            },
        };
        const serverOptions = () => pipeServer.connection;
        const languageClient = new LanguageClient("gradle", "Gradle Language Server", serverOptions, clientOptions);
        void languageClient.onReady().then(
            () => {
                isLanguageServerStarted = true;
                void handleLanguageServerStart(contentProvider, rootProjectsStore);
            },
            (e) => {
                const errorMessage = e instanceof Error ? e.message : String(e);
                void vscode.window.showErrorMessage(errorMessage);
            }
        );
        const currentConfigurationDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("java.import.gradle")) {
                languageClient.sendNotification(DidChangeConfigurationNotification.type, {
                    settings: getGradleSettings(),
                });
            }
        });
        currentDisposables.configuration = currentConfigurationDisposable;
        configurationDisposable = currentConfigurationDisposable;
        const currentClientDisposable = languageClient.start();
        activeLanguageClient = languageClient;
        currentDisposables.client = currentClientDisposable;
        languageClientDisposable = currentClientDisposable;
    });
}

function registerLanguageServerCleanup(context: vscode.ExtensionContext): void {
    if (cleanupDisposableRegistered) {
        return;
    }
    cleanupDisposableRegistered = true;
    context.subscriptions.push(
        new vscode.Disposable(() => {
            cleanupDisposableRegistered = false;
            stopLanguageClient();
        })
    );
}

function stopLanguageClient(): void {
    isLanguageServerStarted = false;
    const client = activeLanguageClient;
    activeLanguageClient = undefined;
    pendingPipeServer?.dispose();
    pendingPipeServer = undefined;
    configurationDisposable?.dispose();
    configurationDisposable = undefined;
    languageClientDisposable = undefined;
    void client?.stop().catch(() => undefined);
}

function createLanguageServerPipeServer(pipeName: string): {
    readonly listening: Promise<void>;
    readonly connection: Promise<StreamInfo>;
    dispose(): void;
} {
    const server = net.createServer();
    let settled = false;
    let rejectConnection: ((reason: Error) => void) | undefined;
    let rejectListening: ((reason: Error) => void) | undefined;
    const connection = new Promise<StreamInfo>((resolve, reject) => {
        rejectConnection = reject;
        server.on("connection", (stream) => {
            if (settled) {
                stream.destroy();
                return;
            }
            settled = true;
            rejectConnection = undefined;
            server.close();
            resolve({ reader: stream, writer: stream });
        });
    });
    void connection.catch(() => undefined);

    const listening = new Promise<void>((resolve, reject) => {
        rejectListening = reject;
        server.on("error", (err) => {
            rejectListening?.(err);
            if (!settled) {
                settled = true;
                const rejectPendingConnection = rejectConnection;
                rejectConnection = undefined;
                rejectPendingConnection?.(err);
            }
        });
        server.listen(pipeName, () => {
            rejectListening = undefined;
            resolve();
        });
    });

    return {
        listening,
        connection,
        dispose: () => {
            if (!settled) {
                settled = true;
                const reject = rejectConnection;
                rejectConnection = undefined;
                reject?.(new Error("Gradle language server pipe listener disposed before connection"));
            }
            try {
                server.close();
            } catch {
                // best-effort cleanup; listener may already be closed
            }
        },
    };
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
        try {
            await syncProject(rootProject);
        } catch (e) {
            // Log but don't propagate - sync failures should not block task discovery
            const message = e instanceof Error ? e.message : String(e);
            logger.error("Failed to sync Gradle project with language server:", message);
        }
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
