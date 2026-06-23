import { checkEnvJavaExecutable, findValidJavaHome, getRedHatJavaEmbeddedJRE } from "../util/config";
import { GRADLE_SERVER_BASE_JVM_OPTS } from "../constant";
import { JavaSource } from "./serverProcessExitInfo";

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

/**
 * Resolved environment for spawning the gradle-server, plus diagnostics about
 * which JDK the launcher will use. `javaHome` is the value forced into
 * `VSCODE_JAVA_HOME`; when it is `undefined` the launcher falls back to
 * `JAVA_HOME`/`PATH` java (`javaSource === "pathFallback"`), which is the risky
 * path that can run the Java 17 jar with an incompatible JDK.
 */
export interface GradleServerEnv {
    env: ProcessEnv;
    javaHome?: string;
    javaSource: JavaSource;
}

export function quoteArg(arg: string): string {
    return `"${arg}"`;
}

export async function getGradleServerEnv(): Promise<GradleServerEnv | undefined> {
    const embeddedJre = getRedHatJavaEmbeddedJRE();
    const validJavaHome = embeddedJre ? undefined : await findValidJavaHome();
    const javaHome = embeddedJre || validJavaHome;
    const env = { ...process.env };
    let javaSource: JavaSource;
    if (javaHome) {
        Object.assign(env, {
            VSCODE_JAVA_HOME: javaHome,
        });
        javaSource = embeddedJre ? "embeddedJre" : "validJavaHome";
    } else if (!checkEnvJavaExecutable()) {
        return undefined;
    } else {
        // No validated JDK >= 17 was resolved, but a `java` is on PATH. The
        // launcher will use JAVA_HOME/PATH java, which may be too old for the
        // Java 17 server jar -> startup code=1 before connecting.
        javaSource = "pathFallback";
    }
    if (env["DEBUG_GRADLE_SERVER"] === "true") {
        env.GRADLE_SERVER_OPTS =
            "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=8089 " + GRADLE_SERVER_BASE_JVM_OPTS;
    } else {
        env.GRADLE_SERVER_OPTS = GRADLE_SERVER_BASE_JVM_OPTS;
    }
    return { env, javaHome, javaSource };
}
