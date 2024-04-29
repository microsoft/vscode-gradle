import * as vscode from "vscode";
import { initializeFromJsonFile, instrumentOperation } from "vscode-extension-telemetry-wrapper";

import { Api } from "./api";
import { Extension } from "./Extension";

let extension: Extension;

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"));
    return instrumentOperation("activation", activateExtension)(context);
}

function activateExtension(_operationId: string, context: vscode.ExtensionContext): Api {
    extension = new Extension(context);
    return extension.getApi();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function deactivate(): Promise<void> {
    await extension?.stop();
}
