import { checkEnvJavaExecutable, findValidJavaHome, getRedHatJavaEmbeddedJRE } from "../util/config";
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

export function appendGradleServerOpts(existingOpts: string | undefined, requiredOpts: string): string {
    return existingOpts ? `${existingOpts} ${requiredOpts}` : requiredOpts;
}

export async function getGradleServerEnv(): Promise<ProcessEnv | undefined> {
    const javaHome = getRedHatJavaEmbeddedJRE() || (await findValidJavaHome());
    const env = { ...process.env };
    if (javaHome) {
        Object.assign(env, {
            VSCODE_JAVA_HOME: javaHome,
        });
    } else if (!checkEnvJavaExecutable()) {
        return undefined;
    }
    if (env["DEBUG_GRADLE_SERVER"] === "true") {
        env.GRADLE_SERVER_OPTS = appendGradleServerOpts(
            env.GRADLE_SERVER_OPTS,
            "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=8089 " + GRADLE_SERVER_BASE_JVM_OPTS
        );
    } else {
        env.GRADLE_SERVER_OPTS = appendGradleServerOpts(env.GRADLE_SERVER_OPTS, GRADLE_SERVER_BASE_JVM_OPTS);
    }
    return env;
}
