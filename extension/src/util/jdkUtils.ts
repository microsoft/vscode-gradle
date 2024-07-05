import { getRuntime, findRuntimes, IJavaRuntime, getSources } from "jdk-utils";
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
                    fs.existsSync(path.join(jdk.homedir, "lib", "jrt-fs.jar"))
                ); // Java 9+
            })
        );
    }
    return cachedJdks;
}
/**
 * Sort by source where JDk is located.
 * The order is:
 * 1. JDK_HOME, JAVA_HOME, PATH
 * 2. JDK manager such as SDKMAN, jEnv, jabba, asdf
 * 3. Common places such as /usr/lib/jvm
 * 4. Others
 */
export function sortJdksBySource(jdks: IJavaRuntime[]) {
    const rankedJdks = jdks as Array<IJavaRuntime & { rank: number }>;
    const env: string[] = ["JDK_HOME", "JAVA_HOME", "PATH"];
    const jdkManagers: string[] = ["SDKMAN", "jEnv", "jabba", "asdf"];
    for (const jdk of rankedJdks) {
        const detectedSources: string[] = getSources(jdk);
        for (const [index, source] of env.entries()) {
            if (detectedSources.includes(source)) {
                jdk.rank = index; // jdk from environment variables
                break;
            }
        }

        if (jdk.rank) {
            continue;
        }

        const fromManager: boolean = detectedSources.some((source) => jdkManagers.includes(source));
        if (fromManager) {
            jdk.rank = env.length + 1; // jdk from the jdk managers such as SDKMAN
        } else if (!detectedSources.length) {
            jdk.rank = env.length + 2; // jdk from common places
        } else {
            jdk.rank = env.length + 3; // jdk from other source such as ~/.gradle/jdks
        }
    }
    rankedJdks.sort((a, b) => a.rank - b.rank);
}

/**
 * Sort by major version in descend order.
 */
export function sortJdksByVersion(jdks: IJavaRuntime[]) {
    jdks.sort((a, b) => (b.version?.major ?? 0) - (a.version?.major ?? 0));
}
