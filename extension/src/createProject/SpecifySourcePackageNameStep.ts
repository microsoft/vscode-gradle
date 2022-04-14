// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";

export class SpecifySourcePackageNameStep implements IProjectCreationStep {
    public static GET_NORMALIZED_PACKAGE_NAME = "getNormalizedPackageName";

    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        if (!metadata.client) {
            return StepResult.STOP;
        }
        const disposables: vscode.Disposable[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const specifySourcePackageNamePromise = new Promise<StepResult>(async (resolve, _reject) => {
            const inputBox = vscode.window.createInputBox();
            const defaultName = metadata.sourcePackageName || "";
            const normalizedName = await metadata.client.getNormalizedPackageName(defaultName);
            if (!normalizedName) {
                return resolve(StepResult.STOP);
            }
            inputBox.title = `Create Gradle project: Specify package name (${metadata.steps.length + 1}/${
                metadata.totalSteps
            })`;
            inputBox.prompt = "Input source package name of your project.";
            inputBox.placeholder = "e.g. " + normalizedName;
            inputBox.value = normalizedName;
            inputBox.ignoreFocusOut = true;
            inputBox.enabled = true;
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
                inputBox.onDidAccept(async () => {
                    const normalizedName = await metadata.client.getNormalizedPackageName(inputBox.value);
                    if (normalizedName === inputBox.value) {
                        metadata.sourcePackageName = inputBox.value;
                        metadata.nextStep = undefined;
                        resolve(StepResult.NEXT);
                    } else {
                        inputBox.enabled = false;
                        inputBox.validationMessage = `Invalid source package name, suggest name: ${normalizedName}`;
                    }
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
}

export const specifySourcePackageNameStep = new SpecifySourcePackageNameStep();
