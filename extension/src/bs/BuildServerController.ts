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
            commands.registerCommand(SEND_TELEMETRY_CMD, (jsonString: string) => {
                const log = JSON.parse(jsonString);
                sendInfo("", log);
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
    }

    public dispose() {
        this.disposable.dispose();
    }
}
