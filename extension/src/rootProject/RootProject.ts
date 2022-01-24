import * as vscode from "vscode";
import { Environment } from "../proto/gradle_pb";

export class RootProject {
    private environment?: Environment;
    constructor(private readonly workspaceFolder: vscode.WorkspaceFolder, private readonly projectUri: vscode.Uri) {}

    public setEnvironment(environment: Environment): void {
        this.environment = environment;
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
