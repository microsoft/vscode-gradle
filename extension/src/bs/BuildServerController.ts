import { Disposable, ExtensionContext, OutputChannel, commands, languages, window } from "vscode";
import { GradleBuildLinkProvider } from "./GradleBuildLinkProvider";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { OpenBuildOutputValue, getOpenBuildOutput } from "../util/config";

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
            })
        );
    }

    public dispose() {
        this.disposable.dispose();
    }
}
