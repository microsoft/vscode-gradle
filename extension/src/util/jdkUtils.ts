// See: https://github.com/redhat-developer/vscode-java/blob/2015139c5773c0107f75d2289e3656f45cb38c98/src/jdkUtils.ts
import { getRuntime, findRuntimes, IJavaRuntime } from "jdk-utils";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

let cachedJdks: IJavaRuntime[];

export async function getMajorVersion(javaHome: string | undefined): Promise<number> {
    if (!javaHome) {
        return 0;
    }
    const runtime = await getRuntime(javaHome, { withVersion: true });
    return runtime?.version?.major || 0;
}

export async function findDefaultRuntimeFromSettings(): Promise<string | undefined> {
    const runtimes = vscode.workspace.getConfiguration().get("java.configuration.runtimes");
    if (Array.isArray(runtimes) && runtimes.length) {
        let candidate: string | undefined;
        for (const runtime of runtimes) {
            if (!runtime || typeof runtime !== "object" || !runtime.path) {
                continue;
            }
            const jr = await getRuntime(runtime.path);
            if (jr) {
                candidate = jr.homedir;
            }
            if (runtime.default) {
                break;
            }
        }
        return candidate;
    }
    return undefined;
}

export async function listJdks(force?: boolean): Promise<IJavaRuntime[]> {
    if (force || !cachedJdks) {
        cachedJdks = await findRuntimes({ checkJavac: true, withVersion: true, withTags: true }).then((jdks) =>
            jdks.filter((jdk) => {
                // Validate if it's a real Java Home
                return (
                    fs.existsSync(path.join(jdk.homedir, "lib", "rt.jar")) ||
                    fs.existsSync(path.join(jdk.homedir, "jre", "lib", "rt.jar")) || // Java 8
                    fs.existsSync(path.join(jdk.homedir, "lib", "jrt-fs.jar")) // Java 9+
                );
            })
        );
    }
    return cachedJdks;
}
