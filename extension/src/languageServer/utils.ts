// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export function prepareLanguageServerParams(): string[] {
    const params = [];
    params.push("-Dfile.encoding=" + getJavaEncoding());
    return params;
}

function getJavaEncoding(): string {
    const config = vscode.workspace.getConfiguration();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const languageConfig = config.get("[java]") as any;
    let javaEncoding = null;
    if (languageConfig) {
        javaEncoding = languageConfig["files.encoding"];
    }
    if (!javaEncoding) {
        javaEncoding = config.get<string>("files.encoding", "UTF-8");
    }
    return javaEncoding;
}
