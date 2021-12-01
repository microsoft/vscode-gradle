// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export function getSpecificVersionStatus(): boolean {
    const versionConfig = vscode.workspace.getConfiguration("java").get<string | null>("import.gradle.version");
    const wrapperConfig = vscode.workspace
        .getConfiguration("java")
        .get<boolean | undefined>("import.gradle.wrapper.enabled");
    return wrapperConfig === false && versionConfig !== null && versionConfig !== "";
}
