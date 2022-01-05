// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";

export class SpecifySourcePackageNameStep implements IProjectCreationStep {
    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        const disposables: vscode.Disposable[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const specifySourcePackageNamePromise = new Promise<StepResult>(async (resolve, _reject) => {
            const inputBox = vscode.window.createInputBox();
            const defaultName = metadata.sourcePackageName || "";
            inputBox.title = `Create Gradle project: Specify package name (${metadata.steps.length + 1}/${
                metadata.totalSteps
            })`;
            inputBox.prompt = "Input source package name of your project.";
            inputBox.placeholder = "e.g. " + defaultName;
            inputBox.value = defaultName;
            inputBox.ignoreFocusOut = true;
            const validationMessage: string | undefined = this.isValidSourcePackageName(defaultName);
            inputBox.enabled = validationMessage === undefined;
            inputBox.validationMessage = validationMessage;
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
                    const validationMessage: string | undefined = this.isValidSourcePackageName(inputBox.value);
                    inputBox.enabled = validationMessage === undefined;
                    inputBox.validationMessage = validationMessage;
                }),
                inputBox.onDidAccept(async () => {
                    metadata.sourcePackageName = inputBox.value;
                    metadata.nextStep = undefined;
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
            return await specifySourcePackageNamePromise;
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    private isValidSourcePackageName(value: string): string | undefined {
        return /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/.test(value) ? undefined : "Invalid Source Package Name.";
    }
}

export const specifySourcePackageNameStep = new SpecifySourcePackageNameStep();
