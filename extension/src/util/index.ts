import * as vscode from "vscode";
import * as net from "net";
import * as path from "path";
import * as fs from "fs";
import { RootProject } from "../rootProject";

export const isTest = (): boolean => process.env.VSCODE_TEST?.toLowerCase() === "true";

// some run application tasks require a lot of time to start. So we should set a loose timeout.
const maximumTimeout = 60000; // ms
const tcpTimeout = 300; // ms

function tcpExists(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const connection = net
            .connect(port, host)
            .on("error", () => {
                resolve(false);
            })
            .on("timeout", () => {
                connection.end(() => {
                    resolve(false);
                });
            })
            .on("connect", () => {
                connection.end(() => {
                    resolve(true);
                });
            });
        connection.setTimeout(tcpTimeout);
    });
}

export function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

async function tryConnect(host: string, port: number, startTime: number): Promise<void> {
    const connected = await tcpExists(host, port);
    if (connected) {
        // workaround: experimental re-checking after waiting for 1s
        await sleep(1000);
        const connectedRetry = await tcpExists(host, port);
        if (connectedRetry) {
            return;
        }
    }
    if (Date.now() - startTime >= maximumTimeout) {
        throw new Error("Unable to wait on tcp due to maxmium timeout reached");
    }
    await tryConnect(host, port, startTime);
}

export function waitOnTcp(host: string, port: number): Promise<void> {
    return tryConnect(host, port, Date.now());
}

export function isGradleRootProject(rootProject: RootProject): boolean {
    return (
        fs.existsSync(path.join(rootProject.getProjectUri().fsPath, "gradlew")) ||
        fs.existsSync(path.join(rootProject.getProjectUri().fsPath, "gradlew.bat"))
    );
}

export function isWorkspaceFolder(value: unknown): value is vscode.WorkspaceFolder {
    return !!value && typeof value !== "number";
}
