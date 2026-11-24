// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { debounce } from "lodash";
import { QuickInputButton, QuickInputButtons, ThemeIcon } from "vscode";
import { IProjectCreationMetadata, ProjectType } from "./types";

export const switchToAdvancedLabel = "Switch to advanced mode...";

export function asyncDebounce(func: any, wait: any, bind: any) {
    const debounced = debounce(async (resolve, reject, bindSelf, args) => {
        try {
            const result = await func.bind(bindSelf)(...args);
            resolve(result);
        } catch (error) {
            reject(error);
        }
    }, wait);

    function returnFunc(...args: any[]) {
        return new Promise((resolve, reject) => {
            debounced(resolve, reject, bind, args);
        });
    }

    return returnFunc;
}

export function updateTotalSteps(metadata: IProjectCreationMetadata): void {
    if (!metadata.isAdvanced) {
        metadata.totalSteps = 2;
    } else if (metadata.projectType === ProjectType.JAVA_GRADLE_PLUGIN) {
        // when creating gradle plugin, we shouldn't specify test framework
        metadata.totalSteps = 4;
    } else {
        metadata.totalSteps = 5;
    }
}

export function createQuickInputButtons(metadata: IProjectCreationMetadata): QuickInputButton[] {
    const buttons: QuickInputButton[] = [];
    if (metadata.steps.length) {
        buttons.push(QuickInputButtons.Back);
    }
    if (!metadata.isAdvanced) {
        buttons.push({
            iconPath: new ThemeIcon("settings-gear"),
            tooltip: switchToAdvancedLabel,
        });
    }
    return buttons;
}
