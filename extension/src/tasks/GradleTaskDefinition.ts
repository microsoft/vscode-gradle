import * as vscode from "vscode";

export interface GradleTaskDefinition extends vscode.TaskDefinition {
    id: string;
    script: string;
    description: string;
    group: string;
    project: string;
    rootProject: string;
    buildFile: string;
    projectFolder: string;
    workspaceFolder: string;
    // the task can be debugged or not
    debuggable: boolean;
    args: string;
    // this run session of the task should be debugged or not
    javaDebug: boolean;
    isPinned: boolean;
}
