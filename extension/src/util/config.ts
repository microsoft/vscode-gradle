import { execSync, spawnSync } from "child_process";
import { JAVA_FILENAME } from "jdk-utils";
import * as vscode from "vscode";
import { GradleConfig } from "../proto/gradle_pb";
import { RootProject } from "../rootProject/RootProject";
import * as fse from "fs-extra";
import * as path from "path";
import { findDefaultRuntimeFromSettings, getMajorVersion, listJdks } from "./jdkUtils";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
type AutoDetect = "on" | "off";
export const REQUIRED_JDK_VERSION = 17;

export function getConfigIsAutoDetectionEnabled(rootProject: RootProject): boolean {
    return (
        vscode.workspace
            .getConfiguration("gradle", rootProject.getWorkspaceFolder().uri)
            .get<AutoDetect>("autoDetect", "on") === "on"
    );
}

export function getConfigJavaHome(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("home", null);
}

export function getJdtlsConfigJavaHome(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("jdt.ls.java.home", null);
}

export function getConfigJavaImportGradleJavaHome(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("import.gradle.java.home", null);
}

export function getJavaExecutablePathFromJavaHome(javaHome: string): string {
    return path.join(javaHome, "bin", JAVA_FILENAME);
}

export async function findValidJavaHome(): Promise<string | undefined> {
    const javaHomeGetters = [getConfigJavaImportGradleJavaHome, getJdtlsConfigJavaHome, getConfigJavaHome];
    let javaHome: string | undefined = undefined;
    let javaVersion = 0;

    for (const getJavaHome of javaHomeGetters) {
        javaHome = getJavaHome() || undefined;
        if (javaHome) {
            javaVersion = await getMajorVersion(javaHome);
            if (javaVersion >= REQUIRED_JDK_VERSION) {
                return javaHome;
            }
        }
    }

    // Prefer JAVA_HOME from environment before scanning system JDKs
    const envJavaHome = process.env.JAVA_HOME;
    if (envJavaHome) {
        javaVersion = await getMajorVersion(envJavaHome);
        if (javaVersion >= REQUIRED_JDK_VERSION) {
            return envJavaHome;
        }
    }

    // Search valid JDKs from env.JAVA_HOME, env.PATH, SDKMAN, jEnv, jabba, common directories
    const javaRuntimes = await listJdks();
    // Some discovered JDKs report an unparseable version (`version` is
    // undefined). Reading `.major` off them previously threw and aborted
    // extension activation, so the gradle-server never started. Track how
    // often this happens so the failure mode stays visible after the fix.
    const unresolvedVersionCount = javaRuntimes.filter((r) => r.version?.major === undefined).length;
    if (unresolvedVersionCount > 0) {
        sendInfo("", {
            kind: "jdkVersionUnresolved",
            dataMsg: JSON.stringify({ unresolved: unresolvedVersionCount, total: javaRuntimes.length }),
        });
    }
    const validJdks = javaRuntimes.find((r) => (r.version?.major ?? 0) >= REQUIRED_JDK_VERSION);
    if (validJdks !== undefined) {
        return validJdks.homedir;
    }

    // Search java.configuration.runtimes if still not found
    javaHome = await findDefaultRuntimeFromSettings();
    javaVersion = await getMajorVersion(javaHome);
    if (javaVersion >= REQUIRED_JDK_VERSION) {
        return javaHome;
    }

    return undefined;
}

export function extensionInstalled(extensionId: string): boolean {
    return !!vscode.extensions.getExtension(extensionId);
}

export function getRedHatJavaEmbeddedJRE(): string | undefined {
    if (!extensionInstalled("redhat.java")) {
        return undefined;
    }

    const jreHome = path.join(vscode.extensions.getExtension("redhat.java")!.extensionPath, "jre");
    if (fse.existsSync(jreHome) && fse.statSync(jreHome).isDirectory()) {
        const candidates = fse.readdirSync(jreHome);
        for (const candidate of candidates) {
            if (fse.existsSync(path.join(jreHome, candidate, "bin", JAVA_FILENAME))) {
                return path.join(jreHome, candidate);
            }
        }
    }
    return undefined;
}

export function checkEnvJavaExecutable(): boolean {
    try {
        execSync("java -version", { stdio: "pipe" });
    } catch (e) {
        return false;
    }
    return true;
}

/**
 * Best-effort major version of the `java` the launcher will actually use on the
 * fallback path, purely for diagnostics. Mirrors gradle-server(.bat): with
 * `VSCODE_JAVA_HOME` unset the launcher runs `%JAVA_HOME%\bin\java` when
 * `JAVA_HOME` is set, otherwise `java` from `PATH`. Probing the same executable
 * keeps the reported version matched to the one running the server jar. Returns
 * 0 when no `java` is reachable or its version banner cannot be parsed.
 * `java -version` prints to stderr (e.g. `openjdk version "11.0.20"` or
 * `"1.8.0_392"`).
 */
export function getEnvJavaMajorVersion(): number {
    try {
        const javaHome = process.env.JAVA_HOME?.replace(/^"+|"+$/g, "");
        let javaExe = "java";
        if (javaHome) {
            const candidate = path.join(javaHome, "bin", JAVA_FILENAME);
            if (fse.existsSync(candidate)) {
                javaExe = candidate;
            }
        }
        // Invoke without a shell and pass arguments as an array so a JAVA_HOME
        // containing spaces or shell metacharacters cannot break or inject into
        // the command. `java -version` prints its banner to stderr, but read
        // both streams in case a JDK ever writes it to stdout.
        const result = spawnSync(javaExe, ["-version"], { encoding: "utf8" });
        const output = `${result.stderr ?? ""}${result.stdout ?? ""}`;
        const match = output.match(/version "(\d+)(?:\.(\d+))?/);
        if (!match) {
            return 0;
        }
        const major = parseInt(match[1], 10);
        // Java 8 and earlier report as 1.x; map "1.8" -> 8.
        if (major === 1 && match[2]) {
            return parseInt(match[2], 10);
        }
        return Number.isNaN(major) ? 0 : major;
    } catch (e) {
        return 0;
    }
}

export function getConfigJavaImportGradleUserHome(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("import.gradle.user.home", null);
}

export function getConfigJavaImportGradleJvmArguments(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("import.gradle.jvmArguments", null);
}

export function getConfigJavaImportGradleWrapperEnabled(): boolean {
    return vscode.workspace.getConfiguration("java").get<boolean>("import.gradle.wrapper.enabled", true);
}

export function getConfigJavaImportGradleVersion(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("import.gradle.version", null);
}

export function getConfigJavaImportGradleHome(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("import.gradle.home", null);
}

export function getConfigIsDebugEnabled(): boolean {
    return vscode.workspace.getConfiguration("gradle").get<boolean>("debug", false);
}

export type ReuseTerminalsValue = "task" | "off" | "all";

export function getConfigReuseTerminals(): ReuseTerminalsValue {
    if (getAllowParallelRun()) {
        return "off";
    }
    return vscode.workspace.getConfiguration("gradle").get<ReuseTerminalsValue>("reuseTerminals", "task");
}

export function getDisableConfirmations(): boolean {
    return vscode.workspace.getConfiguration("gradle").get<boolean>("disableConfirmations", false);
}

export function getConfigFocusTaskInExplorer(): boolean {
    return vscode.workspace.getConfiguration("gradle").get<boolean>("focusTaskInExplorer", true);
}

export function getNestedProjectsConfig(workspaceFolder: vscode.WorkspaceFolder): boolean | ReadonlyArray<string> {
    return vscode.workspace
        .getConfiguration("gradle", workspaceFolder.uri)
        .get<boolean | ReadonlyArray<string>>("nestedProjects", false);
}

export function getShowStoppedDaemons(): boolean {
    return vscode.workspace.getConfiguration("gradle").get<boolean>("showStoppedDaemons", false);
}

export function setShowStoppedDaemons(value: boolean): void {
    void vscode.workspace.getConfiguration("gradle").update("showStoppedDaemons", value, true);
}

export function getJavaDebugCleanOutput(): boolean {
    return vscode.workspace.getConfiguration("gradle").get<boolean>("javaDebug.cleanOutput", true);
}

export function getAllowParallelRun(): boolean {
    return vscode.workspace.getConfiguration("gradle").get<boolean>("allowParallelRun", false);
}

export function getOpenBuildOutput(): OpenBuildOutputValue {
    return vscode.workspace
        .getConfiguration("java.gradle.buildServer")
        .get<OpenBuildOutputValue>("openBuildOutput", OpenBuildOutputValue.ON_BUILD_FAILURE);
}

export enum OpenBuildOutputValue {
    NEVER = "neverOpen",
    ON_BUILD_START = "openOnBuildStart",
    ON_BUILD_FAILURE = "openOnBuildFailure",
}

export enum ProjectOpenBehaviourValue {
    INTERACTIVE = "Interactive",
    OPEN = "Open",
    ADDTOWORKSPACE = "Add to Workspace",
}

export function getProjectOpenBehaviour(): string {
    return vscode.workspace
        .getConfiguration("gradle")
        .get<string>("projectOpenBehaviour", ProjectOpenBehaviourValue.INTERACTIVE);
}

export function getGradleConfig(): GradleConfig {
    const gradleConfig = new GradleConfig();
    const gradleHome = getConfigJavaImportGradleHome();
    const gradleUserHome = getConfigJavaImportGradleUserHome();
    const gradleJvmArguments = getConfigJavaImportGradleJvmArguments();
    const gradleVersion = getConfigJavaImportGradleVersion();
    const javaHome = getConfigJavaImportGradleJavaHome();
    if (gradleHome !== null) {
        gradleConfig.setGradleHome(gradleHome);
    }
    if (gradleUserHome !== null) {
        gradleConfig.setUserHome(gradleUserHome);
    }
    if (gradleJvmArguments !== null) {
        gradleConfig.setJvmArguments(gradleJvmArguments);
    }
    if (gradleVersion !== null) {
        gradleConfig.setVersion(gradleVersion);
    }
    if (javaHome !== null) {
        gradleConfig.setJavaHome(javaHome);
    }
    gradleConfig.setWrapperEnabled(getConfigJavaImportGradleWrapperEnabled());
    const javaExtension = vscode.extensions.getExtension("redhat.java");
    if (javaExtension) {
        const version = javaExtension.packageJSON.version;
        if (version) {
            gradleConfig.setJavaExtensionVersion(version);
        }
    }
    return gradleConfig;
}
