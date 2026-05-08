import * as vscode from "vscode";
import { initializeFromJsonFile, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { Api } from "./api";
import { Extension } from "./Extension";
import { TelemetryFilter } from "./util/telemetryFilter";
import { activeBuildCount, activeBuildSnapshot, diagInfo, diagWarn, shortStack } from "./util/Diagnostics";

let extension: Extension;
let processHooksInstalled = false;

function installProcessHooks(): void {
    if (processHooksInstalled) {
        return;
    }
    processHooksInstalled = true;
    process.on("beforeExit", (code) => {
        diagWarn(`process beforeExit code=${code} activeBuilds=${activeBuildCount()} :: ${activeBuildSnapshot()}`);
    });
    process.on("exit", (code) => {
        diagWarn(`process exit code=${code} activeBuilds=${activeBuildCount()} :: ${activeBuildSnapshot()}`);
    });
    process.on("SIGTERM", () => {
        diagWarn(`process SIGTERM activeBuilds=${activeBuildCount()} :: ${activeBuildSnapshot()}`);
    });
    process.on("uncaughtException", (err) => {
        diagWarn(`uncaughtException ${err.message} stack=${err.stack}`);
    });
    process.on("unhandledRejection", (reason) => {
        const r = reason instanceof Error ? `${reason.message} stack=${reason.stack}` : String(reason);
        diagWarn(`unhandledRejection ${r}`);
    });
}

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), {
        replacementOptions: [TelemetryFilter.hideUrlOption],
    });
    diagInfo(
        `extension activate version=${context.extension?.packageJSON?.version ?? "?"} vscode=${vscode.version} node=${
            process.version
        } platform=${process.platform} pid=${process.pid}`
    );
    installProcessHooks();
    return instrumentOperation("activation", activateExtension)(context);
}

function activateExtension(_operationId: string, context: vscode.ExtensionContext): Api {
    extension = new Extension(context);
    return extension.getApi();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function deactivate(): Promise<void> {
    diagWarn(
        `extension deactivate activeBuilds=${activeBuildCount()} :: ${activeBuildSnapshot()} stack=${shortStack()}`
    );
    await extension?.stop();
}
