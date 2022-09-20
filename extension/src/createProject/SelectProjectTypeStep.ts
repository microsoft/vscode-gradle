// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { selectScriptDSLStep } from "./SelectScriptDSLStep";
import { IProjectCreationMetadata, IProjectCreationStep, ProjectLanguage, ProjectType, StepResult } from "./types";

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
            pickBox.items = this.getProjectTypePickItems(metadata.projectLanguage);
            disposables.push(
                pickBox.onDidAccept(async () => {
                    const selectedType = pickBox.selectedItems[0];
                    if (selectedType) {
                        switch (selectedType.label.split(" ").pop()) {
                            case "application":
                                metadata.projectType = ProjectType.APPLICATION;
                                break;
                            case "library":
                                metadata.projectType = ProjectType.LIBRARY;
                                break;
                            case "plugin":
                                metadata.projectType = ProjectType.GRADLE_PLUGIN;
                                metadata.totalSteps = metadata.projectLanguage === ProjectLanguage.JAVA ? 5 : 4;
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

    private getProjectTypePickItems(language?: ProjectLanguage): vscode.QuickPickItem[] {
        const result: vscode.QuickPickItem[] = [];
        const lang =
            language == ProjectLanguage.CPP
                ? "C++"
                : language
                ? language.charAt(0).toUpperCase() + language.substring(1)
                : "Java";

        result.push({
            label: `${lang} application`,
            description: `A command-line application implemented in ${lang}`,
        });
        result.push({
            label: `${lang} library`,
            description: `A ${lang} library`,
        });

        if (language === ProjectLanguage.JAVA || language === ProjectLanguage.KOTLIN) {
            result.push({
                label: `${lang} Gradle plugin`,
                description: `A Gradle plugin implemented in ${lang}`,
            });
        }

        return result;
    }
}

export const selectProjectTypeStep = new SelectProjectTypeStep();
