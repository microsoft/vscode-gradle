import * as vscode from "vscode";
import { initialize, instrumentOperation } from "vscode-extension-telemetry-wrapper";

import { Api } from "./api";
import { Extension } from "./Extension";

let extension: Extension;

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
    initializeTelemetry();
    return instrumentOperation("activation", activateExtension)(context);
}

function activateExtension(_operationId: string, context: vscode.ExtensionContext): Api {
    extension = new Extension(context);
    return extension.getApi();
}

function initializeTelemetry(): void {
    const ext = vscode.extensions.getExtension("vscjava.vscode-gradle");
    const packageInfo = ext ? ext.packageJSON : undefined;
    if (packageInfo && packageInfo.aiKey) {
        initialize(packageInfo.id, packageInfo.version, packageInfo.aiKey, {
            firstParty: true,
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function deactivate(): Promise<void> {
    await extension.deactivate();
}
