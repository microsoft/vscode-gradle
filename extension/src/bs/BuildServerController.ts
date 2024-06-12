// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {
    ConfigurationChangeEvent,
    Disposable,
    ExtensionContext,
    OutputChannel,
    commands,
    languages,
    window,
    workspace,
} from "vscode";
import { GradleBuildLinkProvider } from "./GradleBuildLinkProvider";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { OpenBuildOutputValue, getOpenBuildOutput } from "../util/config";
import * as path from "path";
import * as fse from "fs-extra";

const APPEND_BUILD_LOG_CMD = "_java.gradle.buildServer.appendBuildLog";
const LOG_CMD = "_java.gradle.buildServer.log";
const SEND_TELEMETRY_CMD = "_java.gradle.buildServer.sendTelemetry";

export class BuildServerController implements Disposable {
    private disposable: Disposable;
    private buildOutputChannel: OutputChannel;
    private logOutputChannel: OutputChannel;

    public constructor(readonly context: ExtensionContext) {
        this.buildOutputChannel = window.createOutputChannel("Build Server for Gradle (Build)", "gradle-build");
        this.logOutputChannel = window.createOutputChannel("Build Server for Gradle (Log)");
        this.disposable = Disposable.from(
            this.buildOutputChannel,
            languages.registerDocumentLinkProvider(
                { language: "gradle-build", scheme: "output" },
                new GradleBuildLinkProvider()
            ),
            commands.registerCommand(APPEND_BUILD_LOG_CMD, (msg: string) => {
                if (msg) {
                    this.buildOutputChannel.appendLine(msg);
                    const openBehavior: OpenBuildOutputValue = getOpenBuildOutput();
                    if (openBehavior === OpenBuildOutputValue.NEVER) {
                        return;
                    }

                    const pattern =
                        openBehavior === OpenBuildOutputValue.ON_BUILD_START
                            ? /^> Build starts at /m
                            : /^BUILD FAILED/m;
                    if (pattern.test(msg)) {
                        this.buildOutputChannel.show(true);
                    }
                }
            }),

            this.logOutputChannel,
            commands.registerCommand(LOG_CMD, (msg: string) => {
                if (msg) {
                    this.logOutputChannel.appendLine(msg);
                }
            }),
            commands.registerCommand(SEND_TELEMETRY_CMD, (data: string | object | Error) => {
                let jsonObj: { [key: string]: any };
                if (typeof data === "string") {
                    jsonObj = JSON.parse(data);
                } else {
                    jsonObj = data;
                }

                const { kind, trace, rootCauseMessage, schemaVersion, ...rest } = jsonObj;
                if (trace || rootCauseMessage) {
                    sendInfo("", {
                        kind: "bsp-error",
                        operationName: jsonObj.operationName,
                        rootCauseMessage,
                        trace,
                    });
                } else {
                    sendInfo("", {
                        kind: kind,
                        data2: JSON.stringify(rest),
                        ...(schemaVersion && { schemaVersion: schemaVersion }),
                    });
                }
            }),
            workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
                if (e.affectsConfiguration("java.gradle.buildServer.enabled")) {
                    const storagePath = context.storageUri?.fsPath;
                    if (!storagePath) {
                        return;
                    }

                    const msg =
                        "Please reload to make the change of 'java.gradle.buildServer.enabled' take effect. Reload now?";
                    const action = "Reload";
                    window.showWarningMessage(msg, action).then(async (selection) => {
                        if (action === selection) {
                            // generate a flag file to make it a clean reload.
                            // https://github.com/redhat-developer/vscode-java/blob/d02cf8ecfee1f3f528770a51ada825d522356967/src/settings.ts#L46
                            const jlsWorkspacePath = path.resolve(storagePath, "..", "redhat.java", "jdt_ws");
                            await fse.ensureDir(jlsWorkspacePath);
                            const flagFile = path.resolve(jlsWorkspacePath, ".cleanWorkspace");
                            await fse.writeFile(flagFile, "");
                            commands.executeCommand("workbench.action.reloadWindow");
                        }
                    });
                }
            })
        );
        this.checkMachineStatus();
    }

    public dispose() {
        this.disposable.dispose();
    }

    private async checkMachineStatus() {
        const machineStatus: { [key: string]: string } = {};
        if (this.isGradleExecutableOnPath()) {
            machineStatus.gradleExecutableFound = "true";
        }
        if (this.hasProxy()) {
            machineStatus.hasProxy = "true";
        }
        const gradleVersionInWrapper = await this.gradleVersionInWrapper();
        if (gradleVersionInWrapper) {
            machineStatus.gradleVersionInWrapper = gradleVersionInWrapper;
        }
        machineStatus.hasProjectAtWorkspaceRoot = (await this.hasProjectAtWorkspaceRoot()).toString();
        sendInfo("", {
            kind: "machineStatus",
            data: JSON.stringify(machineStatus),
        });
    }

    private isGradleExecutableOnPath(): boolean {
        if (process.env.PATH) {
            const pathDirectories = process.env.PATH.split(path.delimiter);
            for (const dir of pathDirectories) {
                const executablePath = path.join(dir, "gradle");
                if (fse.existsSync(executablePath) && fse.statSync(executablePath).isFile()) {
                    return true;
                }
            }
        }
        return false;
    }

    private hasProxy(): boolean {
        return !!(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || workspace.getConfiguration("http").get("proxy"));
    }

    private async gradleVersionInWrapper(): Promise<string> {
        const propertiesFile = await workspace.findFiles("**/gradle/wrapper/gradle-wrapper.properties", undefined, 1);
        if (propertiesFile.length === 0) {
            return "";
        }

        const properties = await workspace.fs.readFile(propertiesFile[0]);
        const propertiesContent = properties.toString();
        const versionMatch = /^distributionUrl=.*\/gradle-([0-9.]+)-.*$/m.exec(propertiesContent);
        if (versionMatch) {
            return versionMatch[1];
        }
        return "";
    }

    private async hasProjectAtWorkspaceRoot(): Promise<boolean> {
        const file = await workspace.findFiles(
            "{settings.gradle,build.gradle,settings.gradle.kts,build.gradle.kts}",
            undefined,
            1
        );
        return file.length > 0;
    }
}
