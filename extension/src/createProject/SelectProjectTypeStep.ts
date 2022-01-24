// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { selectScriptDSLStep } from "./SelectScriptDSLStep";
import { IProjectCreationMetadata, IProjectCreationStep, ProjectType, StepResult } from "./types";

export class SelectProjectTypeStep implements IProjectCreationStep {
    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        const disposables: vscode.Disposable[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const selectProjectTypePromise = new Promise<StepResult>(async (resolve, _reject) => {
            const pickBox = vscode.window.createQuickPick<vscode.QuickPickItem>();
            pickBox.title = `Create Gradle project: Select project type (${metadata.steps.length + 1}/${
                metadata.totalSteps
            })`;
            pickBox.placeholder = "Select project type ...";
            pickBox.matchOnDescription = true;
            pickBox.ignoreFocusOut = true;
            pickBox.items = this.getProjectTypePickItems();
            disposables.push(
                pickBox.onDidAccept(async () => {
                    const selectedType = pickBox.selectedItems[0];
                    if (selectedType) {
                        switch (selectedType.label) {
                            case "application":
                                metadata.projectType = ProjectType.JAVA_APPLICATION;
                                metadata.totalSteps = 5;
                                break;
                            case "library":
                                metadata.projectType = ProjectType.JAVA_LIBRARY;
                                metadata.totalSteps = 5;
                                break;
                            case "Gradle plugin":
                                metadata.projectType = ProjectType.JAVA_GRADLE_PLUGIN;
                                metadata.totalSteps = 4; // when creating gradle plugin, we shouldn't specify test framework
                                break;
                            default:
                                resolve(StepResult.STOP);
                        }
                        metadata.steps.push(selectProjectTypeStep);
                        metadata.nextStep = selectScriptDSLStep;
                        resolve(StepResult.NEXT);
                    }
                }),
                pickBox.onDidHide(() => {
                    resolve(StepResult.STOP);
                })
            );
            disposables.push(pickBox);
            pickBox.show();
        });

        try {
            return await selectProjectTypePromise;
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    private getProjectTypePickItems(): vscode.QuickPickItem[] {
        const result: vscode.QuickPickItem[] = [];
        result.push({
            label: "application",
            description: "A command-line application implemented in Java",
        });
        result.push({
            label: "library",
            description: "A Java library",
        });
        result.push({
            label: "Gradle plugin",
            description: "A Gradle plugin implemented in Java",
        });
        return result;
    }
}

export const selectProjectTypeStep = new SelectProjectTypeStep();
