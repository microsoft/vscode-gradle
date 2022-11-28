// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { specifySourcePackageNameStep } from "./SpecifySourcePackageNameStep";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";

export class SpecifyProjectNameStep implements IProjectCreationStep {
    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        const disposables: vscode.Disposable[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const specifyProjectNamePromise = new Promise<StepResult>(async (resolve, _reject) => {
            const inputBox = vscode.window.createInputBox();
            inputBox.title = `Create Gradle project: Specify project name (${metadata.steps.length + 1}/${
                metadata.totalSteps
            })`;
            inputBox.prompt = "Input name of your project.";
            inputBox.placeholder = "e.g. " + metadata.projectName;
            inputBox.value = metadata.projectName;
            inputBox.ignoreFocusOut = true;
            inputBox.validationMessage = this.isValidProjectName(metadata.projectName);
            if (metadata.steps.length) {
                inputBox.buttons = [vscode.QuickInputButtons.Back];
                disposables.push(
                    inputBox.onDidTriggerButton((item) => {
                        if (item === vscode.QuickInputButtons.Back) {
                            resolve(StepResult.PREVIOUS);
                        }
                    })
                );
            }
            disposables.push(
                inputBox.onDidChangeValue(() => {
                    inputBox.validationMessage = this.isValidProjectName(inputBox.value);
                }),
                inputBox.onDidAccept(async () => {
                    if (inputBox.validationMessage) {
                        return;
                    }
                    metadata.projectName = inputBox.value;
                    metadata.steps.push(specifyProjectNameStep);
                    metadata.nextStep = !metadata.isAdvanced ? undefined : specifySourcePackageNameStep;
                    resolve(StepResult.NEXT);
                }),
                inputBox.onDidHide(() => {
                    resolve(StepResult.STOP);
                })
            );
            disposables.push(inputBox);
            inputBox.show();
        });

        try {
            return await specifyProjectNamePromise;
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    private isValidProjectName(value: string): string | undefined {
        return value.length > 0 ? undefined : "Invalid Project Name.";
    }
}

export const specifyProjectNameStep = new SpecifyProjectNameStep();
