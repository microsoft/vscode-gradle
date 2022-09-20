// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { GradleClient } from "../client";
import { getRunTaskCommandCancellationKey } from "../client/CancellationKeys";
import { selectProjectLanguageStep } from "../createProject/SelectProjectLanguageStep";
import { selectScriptDSLStep } from "../createProject/SelectScriptDSLStep";
import {
    IProjectCreationMetadata,
    IProjectCreationStep,
    ProjectLanguage,
    ProjectType,
    StepResult,
} from "../createProject/types";
import { Command } from "./Command";

export const COMMAND_CREATE_PROJECT = "gradle.createProject";
export const COMMAND_CREATE_PROJECT_ADVANCED = "gradle.createProjectAdvanced";

export class CreateProjectCommand extends Command {
    constructor(private client: GradleClient) {
        super();
    }

    async run(params: unknown[]): Promise<void> {
        if (!params || params[0] === undefined) {
            return;
        }
        const folders = vscode.workspace.workspaceFolders;
        const targetFolderUri = await vscode.window.showOpenDialog({
            defaultUri: folders && folders.length ? folders[0].uri : undefined,
            title: "Select target Folder",
            openLabel: "Select",
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        });
        const isAdvanced = params[0] as boolean;
        if (targetFolderUri) {
            const metadata: IProjectCreationMetadata = {
                isAdvanced: isAdvanced,
                totalSteps: isAdvanced ? 5 : 2,
                testFramework: undefined, // junit4 or kotlin-test for kotlin projects
                projectLanguage: ProjectLanguage.JAVA,
                projectType: ProjectType.APPLICATION,
                targetFolder: targetFolderUri[0].fsPath,
                projectName: path.basename(targetFolderUri[0].fsPath),
                sourcePackageName: await this.client.getNormalizedPackageName(path.basename(targetFolderUri[0].fsPath)),
                steps: [],
                nextStep: isAdvanced ? selectProjectLanguageStep : selectScriptDSLStep,
                client: this.client,
            };
            const success = await this.runSteps(metadata);
            if (success) {
                await this.createProject(metadata);
                const openInNewWindow = folders !== undefined;
                vscode.commands.executeCommand(
                    "vscode.openFolder",
                    vscode.Uri.file(metadata.targetFolder),
                    openInNewWindow
                );
            }
        }
        return;
    }

    private async runSteps(metadata: IProjectCreationMetadata): Promise<boolean> {
        let step: IProjectCreationStep | undefined = metadata.nextStep;
        while (step !== undefined) {
            const result = await step.run(metadata);
            switch (result) {
                case StepResult.NEXT:
                    step = metadata.nextStep;
                    break;
                case StepResult.PREVIOUS:
                    if (metadata.steps.length === 0) {
                        return false;
                    }
                    step = metadata.steps.pop();
                    break;
                case StepResult.STOP:
                    return false; // user cancellation
                default:
                    throw new Error("invalid StepResult returned.");
            }
        }
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async createProject(metadata: IProjectCreationMetadata): Promise<void> {
        const cancellationKey = getRunTaskCommandCancellationKey(metadata.targetFolder, "init");
        const args: string[] = ["init"];
        if (!metadata.projectType || !metadata.scriptDSL || !metadata.projectName || !metadata.sourcePackageName) {
            return;
        }
        args.push("--dsl");
        args.push(metadata.scriptDSL);
        args.push("--type");
        args.push(`${metadata.projectLanguage || "java"}-${metadata.projectType}`);
        if (metadata.testFramework) {
            args.push("--test-framework");
            args.push(metadata.testFramework);
        }
        args.push("--project-name");
        args.push(metadata.projectName);
        if (metadata.sourcePackageName && metadata.projectLanguage !== ProjectLanguage.CPP) {
            args.push("--package");
            args.push(metadata.sourcePackageName);
        }
        await this.client.runBuild(
            metadata.targetFolder,
            cancellationKey,
            args,
            "",
            0,
            undefined,
            undefined,
            true,
            "Create Gradle project",
            vscode.ProgressLocation.Notification
        );
    }
}
