import * as vscode from "vscode";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { Environment } from "../proto/gradle_pb";
import { isTest } from "../util";

export class RootProject {
    private environment?: Environment;
    private gradleVersion?: string;
    constructor(private readonly workspaceFolder: vscode.WorkspaceFolder, private readonly projectUri: vscode.Uri) {}

    public setEnvironment(environment: Environment): void {
        this.environment = environment;
        const gradleVersion = environment.getGradleEnvironment()?.getGradleVersion();
        if (gradleVersion && gradleVersion !== this.gradleVersion) {
            this.gradleVersion = gradleVersion;
            if (!isTest()) {
                sendInfo("", { name: "changeGradleVersion", gradleVersion: gradleVersion });
            }
        }
    }

    public getEnvironment(): Environment | undefined {
        return this.environment;
    }

    public getWorkspaceFolder(): vscode.WorkspaceFolder {
        return this.workspaceFolder;
    }

    public getProjectUri(): vscode.Uri {
        return this.projectUri;
    }
}
