// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";
import { asyncDebounce } from "./utils";

export class SpecifySourcePackageNameStep implements IProjectCreationStep {
    public static GET_NORMALIZED_PACKAGE_NAME = "getNormalizedPackageName";

    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        if (!metadata.client) {
            return StepResult.STOP;
        }
        const getNormalizedPackageNameTrigger = asyncDebounce(
            metadata.client.getNormalizedPackageName,
            500 /** ms */,
            metadata.client
        );
        const disposables: vscode.Disposable[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const specifySourcePackageNamePromise = new Promise<StepResult>(async (resolve, _reject) => {
            const inputBox = vscode.window.createInputBox();
            const defaultName = metadata.sourcePackageName || "";
            const normalizedName = await getNormalizedPackageNameTrigger(defaultName);
            if (!normalizedName) {
                return resolve(StepResult.STOP);
            }
            inputBox.title = `Create Gradle project: Specify package name (${metadata.steps.length + 1}/${
                metadata.totalSteps
            })`;
            inputBox.prompt = "Input source package name of your project.";
            inputBox.placeholder = "e.g. " + normalizedName;
            inputBox.value = normalizedName as string;
            inputBox.ignoreFocusOut = true;
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
                inputBox.onDidChangeValue(async () => {
                    const normalizedName = await getNormalizedPackageNameTrigger(inputBox.value);
                    if (!normalizedName) {
                        return;
                    } else if (normalizedName !== inputBox.value) {
                        inputBox.validationMessage = `Invalid source package name, suggest name: ${normalizedName}`;
                    } else {
                        inputBox.validationMessage = undefined;
                    }
                }),
                inputBox.onDidAccept(async () => {
                    const normalizedName = await metadata.client.getNormalizedPackageName(inputBox.value);
                    if (!normalizedName) {
                        return;
                    } else if (normalizedName !== inputBox.value) {
                        inputBox.validationMessage = `Invalid source package name, suggest name: ${normalizedName}`;
                    } else {
                        metadata.sourcePackageName = inputBox.value;
                        metadata.nextStep = undefined;
                        resolve(StepResult.NEXT);
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
