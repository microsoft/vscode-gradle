import * as vscode from 'vscode';
import { Environment } from '../proto/gradle_pb';
import { JavaDebug } from '../config';

export class RootProject {
  private environment?: Environment;
  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly projectUri: vscode.Uri,
    private readonly javaDebug: JavaDebug
  ) {}

  public setEnvironment(environment: Environment): void {
    this.environment = environment;
  }

  public getEnvironment(): Environment | undefined {
    return this.environment;
  }

  public getJavaDebug(): JavaDebug {
    return this.javaDebug;
  }

  public getWorkspaceFolder(): vscode.WorkspaceFolder {
    return this.workspaceFolder;
  }

  public getProjectUri(): vscode.Uri {
    return this.projectUri;
  }
}
