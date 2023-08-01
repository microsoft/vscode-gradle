import { Disposable, ExtensionContext, OutputChannel, commands, languages, window } from "vscode";
import { GradleBuildLinkProvider } from "./GradleBuildLinkProvider";

export class BuildServerController implements Disposable {
    private disposable: Disposable;
    private buildOutputChannel: OutputChannel;

    public constructor(readonly context: ExtensionContext) {
        this.buildOutputChannel = window.createOutputChannel("Build Server for Gradle (Build)", "gradle-build");
        this.disposable = Disposable.from(
            this.buildOutputChannel,
            languages.registerDocumentLinkProvider({ language: "gradle-build", scheme: 'output' }, new GradleBuildLinkProvider()),
            commands.registerCommand("_java.gradle.buildServer.appendBuildLog", (msg: string) => {
                if (msg) {
                    this.buildOutputChannel.appendLine(msg);
                    if (/^BUILD (SUCCESSFUL|FAILED)/.test(msg)) {
                        this.buildOutputChannel.appendLine('------\n');
                        this.buildOutputChannel.show(true);
                    }
                }
            }),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }
}
