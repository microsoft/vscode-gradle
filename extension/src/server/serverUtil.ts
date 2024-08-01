import {
    checkEnvJavaExecutable,
    findValidJavaHome,
    getConfigJavaImportGradleJavaHomeIfHigherThan,
    getRedHatJavaEmbeddedJRE,
    REQUIRED_JDK_VERSION,
} from "../util/config";
import { GRADLE_SERVER_BASE_JVM_OPTS } from "../constant";

export function getGradleServerCommand(): string {
    const platform = process.platform;
    if (platform === "win32") {
        return "gradle-server.bat";
    } else if (platform === "linux" || platform === "darwin") {
        return "gradle-server";
    } else {
        throw new Error("Unsupported platform");
    }
}

export interface ProcessEnv {
    [key: string]: string | undefined;
}

export function quoteArg(arg: string): string {
    return `"${arg}"`;
}

export async function getGradleServerEnv(): Promise<ProcessEnv | undefined> {
    const javaHome =
        (await getConfigJavaImportGradleJavaHomeIfHigherThan(REQUIRED_JDK_VERSION)) ||
        getRedHatJavaEmbeddedJRE() ||
        (await findValidJavaHome());
    const env = { ...process.env };
    if (javaHome) {
        Object.assign(env, {
            VSCODE_JAVA_HOME: javaHome,
        });
        if (env["DEBUG_GRADLE_SERVER"] === "true") {
            env.GRADLE_SERVER_OPTS =
                "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=8089 " + GRADLE_SERVER_BASE_JVM_OPTS;
        } else {
            env.GRADLE_SERVER_OPTS = GRADLE_SERVER_BASE_JVM_OPTS;
        }
    } else if (!checkEnvJavaExecutable()) {
        return undefined;
    }
    return env;
}
