// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { specifyProjectNameStep } from "./SpecifyProjectNameStep";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult, TestFramework } from "./types";

export class SelectTestFrameworkStep implements IProjectCreationStep {
    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        const disposables: vscode.Disposable[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const selectTestFrameworkPromise = new Promise<StepResult>(async (resolve, _reject) => {
            const pickBox = vscode.window.createQuickPick<vscode.QuickPickItem>();
            pickBox.title = `Create Gradle project: Select test framework (${metadata.steps.length + 1}/${
                metadata.totalSteps
            })`;
            pickBox.placeholder = "Select test framework ...";
            pickBox.matchOnDescription = true;
            pickBox.ignoreFocusOut = true;
            pickBox.items = this.getTestFrameworkPickItems();
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
                    const selectedTestFramework = pickBox.selectedItems[0];
                    if (selectedTestFramework) {
                        switch (selectedTestFramework.label) {
                            case "JUnit 4":
                                // junit4 is the default test framework
                                metadata.testFramework = undefined;
                                break;
                            case "TestNG":
                                metadata.testFramework = TestFramework.TESTNG;
                                break;
                            case "Spock":
                                metadata.testFramework = TestFramework.SPOCK;
                                break;
                            case "JUnit Jupiter":
                                metadata.testFramework = TestFramework.JUNIT_JUPITER;
                                break;
                            default:
                                resolve(StepResult.STOP);
                        }
                        metadata.steps.push(selectTestFrameworkStep);
                        metadata.nextStep = specifyProjectNameStep;
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
            return await selectTestFrameworkPromise;
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    private getTestFrameworkPickItems(): vscode.QuickPickItem[] {
        const result: vscode.QuickPickItem[] = [];
        result.push({
            label: "JUnit 4",
        });
        result.push({
            label: "TestNG",
        });
        result.push({
            label: "Spock",
        });
        result.push({
            label: "JUnit Jupiter",
        });
        return result;
    }
}

export const selectTestFrameworkStep = new SelectTestFrameworkStep();
