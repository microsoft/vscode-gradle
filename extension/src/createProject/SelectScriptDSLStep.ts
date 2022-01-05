// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { selectTestFrameworkStep } from "./SelectTestFrameworkStep";
import { specifyProjectNameStep } from "./SpecifyProjectNameStep";
import { IProjectCreationMetadata, IProjectCreationStep, ProjectType, StepResult } from "./types";

export class SelectScriptDSLStep implements IProjectCreationStep {
    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        const disposables: vscode.Disposable[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const selectScriptDSLPromise = new Promise<StepResult>(async (resolve, _reject) => {
            const pickBox = vscode.window.createQuickPick<vscode.QuickPickItem>();
            pickBox.title = `Create Gradle project: Select script DSL (${metadata.steps.length + 1}/${
                metadata.totalSteps
            })`;
            pickBox.placeholder = "Select build script DSL ...";
            pickBox.matchOnDescription = true;
            pickBox.ignoreFocusOut = true;
            pickBox.items = this.getScriptDSLPickItems();
            if (metadata.steps.length) {
                pickBox.buttons = [vscode.QuickInputButtons.Back];
                disposables.push(
                    pickBox.onDidTriggerButton((item) => {
                        if (item === vscode.QuickInputButtons.Back) {
                            resolve(StepResult.PREVIOUS);
                        }
                    })
                );
            }
            disposables.push(
                pickBox.onDidAccept(() => {
                    const selectedScriptDSL = pickBox.selectedItems[0];
                    if (selectedScriptDSL) {
                        switch (selectedScriptDSL.label) {
                            case "Groovy":
                                metadata.scriptDSL = "groovy";
                                break;
                            case "Kotlin":
                                metadata.scriptDSL = "kotlin";
                                break;
                            default:
                                resolve(StepResult.STOP);
                        }
                        metadata.steps.push(selectScriptDSLStep);
                        if (!metadata.isAdvanced || metadata.projectType === ProjectType.JAVA_GRADLE_PLUGIN) {
                            metadata.nextStep = specifyProjectNameStep;
                        } else {
                            metadata.nextStep = selectTestFrameworkStep;
                        }
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
            return await selectScriptDSLPromise;
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    private getScriptDSLPickItems(): vscode.QuickPickItem[] {
        const result: vscode.QuickPickItem[] = [];
        result.push({
            label: "Groovy",
        });
        result.push({
            label: "Kotlin",
        });
        return result;
    }
}

export const selectScriptDSLStep = new SelectScriptDSLStep();
