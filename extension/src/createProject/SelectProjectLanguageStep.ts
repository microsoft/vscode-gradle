// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { selectProjectTypeStep } from "./SelectProjectTypeStep";
import { IProjectCreationMetadata, IProjectCreationStep, ProjectLanguage, StepResult } from "./types";

export class SelectProjectLanguageStep implements IProjectCreationStep {
    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        const disposables: vscode.Disposable[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const selectProjectLanguagePromise = new Promise<StepResult>(async (resolve, _reject) => {
            const pickBox = vscode.window.createQuickPick<vscode.QuickPickItem>();
            pickBox.title = `Create Gradle project: Select project language (${metadata.steps.length + 1}/${
                metadata.totalSteps
            })`;
            pickBox.placeholder = "Select project language ...";
            pickBox.matchOnDescription = true;
            pickBox.ignoreFocusOut = true;
            pickBox.items = this.getProjectLanguagePickItems();
            disposables.push(
                pickBox.onDidAccept(async () => {
                    const selectedType = pickBox.selectedItems[0];
                    if (selectedType) {
                        switch (selectedType.label) {
                            case "Java":
                                metadata.projectLanguage = ProjectLanguage.JAVA;
                                metadata.totalSteps = 6;
                                break;
                            case "Kotlin":
                                metadata.projectLanguage = ProjectLanguage.KOTLIN;
                                metadata.totalSteps = 5;
                                break;
                            case "Groovy":
                                metadata.projectLanguage = ProjectLanguage.GROOVY;
                                metadata.totalSteps = 5;
                                break;
                            case "Scala":
                                metadata.projectLanguage = ProjectLanguage.SCALA;
                                metadata.totalSteps = 5;
                                break;
                            case "C++":
                                metadata.projectLanguage = ProjectLanguage.CPP;
                                metadata.totalSteps = 4;
                                break;
                            default:
                                resolve(StepResult.STOP);
                        }
                        metadata.steps.push(selectProjectLanguageStep);
                        metadata.nextStep = selectProjectTypeStep;
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
            return await selectProjectLanguagePromise;
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    private getProjectLanguagePickItems(): vscode.QuickPickItem[] {
        const result: vscode.QuickPickItem[] = [];
        result.push({
            label: "Java",
        });
        result.push({
            label: "Kotlin",
        });
        result.push({
            label: "Groovy",
        });
        result.push({
            label: "Scala",
        });
        result.push({
            label: "C++",
        });
        return result;
    }
}

export const selectProjectLanguageStep = new SelectProjectLanguageStep();
