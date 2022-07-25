// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const JAVA_EXTENSION_ID = "redhat.java";

export function isJavaExtEnabled(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const javaExt: vscode.Extension<any> | undefined = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    return !!javaExt;
}
