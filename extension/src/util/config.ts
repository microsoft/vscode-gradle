import { execSync } from "child_process";
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

/** The environment variables the launcher resolves a Java home from, in precedence order. */
export type JavaHomeEnvVar = "VSCODE_JAVA_HOME" | "JAVA_HOME";

/**
 * Read an env Java home exactly as the gradle-server launcher does: on Windows it
 * strips quotes (`%_JAVA_HOME:"=%`); on every other platform it is used verbatim
 * (`${VSCODE_JAVA_HOME:-$JAVA_HOME}`). It deliberately does NOT trim whitespace on
 * any platform, so a whitespace-polluted home is reported just as the launcher would
 * (mis)use it, keeping the gate's prediction aligned with the launcher.
 */
export function readLauncherJavaHomeValue(raw: string, platform: NodeJS.Platform = process.platform): string {
    return platform === "win32" ? raw.replace(/"/g, "") : raw;
}

/**
 * The effective Java home the gradle-server launcher will use, mirroring its
 * `VSCODE_JAVA_HOME` > `JAVA_HOME` precedence (Unix `${VSCODE_JAVA_HOME:-$JAVA_HOME}`;
 * Windows overrides `_JAVA_HOME` with `VSCODE_JAVA_HOME` when defined). The value is
 * read via {@link readLauncherJavaHomeValue} (verbatim on Unix, quotes stripped on
 * Windows, never trimmed). Returns the resolved value together with which env var
 * supplied it, or `undefined` when neither is set.
 */
function resolveLauncherJavaHome(): { value: string; envVar: JavaHomeEnvVar } | undefined {
    for (const envVar of ["VSCODE_JAVA_HOME", "JAVA_HOME"] as const) {
        const raw = process.env[envVar];
        if (!raw) {
            continue;
        }
        return { value: readLauncherJavaHomeValue(raw), envVar };
    }
    return undefined;
}

/**
 * Whether `javaPath` looks usable to the launcher: it must exist and—on
 * non-Windows, matching the launcher's `-x` test—be executable. On Windows the
 * launcher only checks for existence.
 */
function isUsableJavaExecutable(javaPath: string): boolean {
    try {
        if (!fse.statSync(javaPath).isFile()) {
            return false;
        }
        fse.accessSync(javaPath, process.platform === "win32" ? fse.constants.F_OK : fse.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Whether the gradle-server launcher will find a usable `java`, mirroring
 * gradle-server(.bat) precedence: when `VSCODE_JAVA_HOME`/`JAVA_HOME` is set the
 * launcher uses `<home>/bin/java` and aborts if it is missing or (on Unix) not
 * executable (it never falls back to `PATH`); only when neither is set does it
 * use `java` from `PATH`. Probing only `PATH` here would let
 * {@link getGradleServerEnv} treat a set-but-broken home as usable, spawn, and
 * let the launcher fail with a cryptic "invalid directory" error instead of
 * surfacing a clear prompt.
 */
export function checkEnvJavaExecutable(): boolean {
    const javaHome = resolveLauncherJavaHome();
    if (javaHome) {
        return isUsableJavaExecutable(path.join(javaHome.value, "bin", JAVA_FILENAME));
    }
    try {
        execSync("java -version", { stdio: "pipe" });
    } catch (e) {
        return false;
    }
    return true;
}

export type MissingJavaReason = "javaHomeInvalidDir" | "noJavaOnPath";

export interface JavaHomeInvalidDirInfo {
    reason: "javaHomeInvalidDir";
    /**
     * The offending effective Java home value. Reflects `VSCODE_JAVA_HOME` when
     * set, otherwise `JAVA_HOME`.
     */
    javaHome: string;
    /** Which env var supplied {@link javaHome}. */
    envVar: JavaHomeEnvVar;
}

export interface NoJavaOnPathInfo {
    reason: "noJavaOnPath";
}

export type MissingJavaInfo = JavaHomeInvalidDirInfo | NoJavaOnPathInfo;

/**
 * Explains why {@link checkEnvJavaExecutable} found no usable `java`. Only valid
 * on that path: when the launcher's effective Java home is set (`VSCODE_JAVA_HOME`
 * if present, otherwise `JAVA_HOME`) its `bin/java` is missing or not executable
 * (`javaHomeInvalidDir`); otherwise no `java` was found on `PATH` (`noJavaOnPath`).
 */
export function getMissingJavaInfo(): MissingJavaInfo {
    const javaHome = resolveLauncherJavaHome();
    return javaHome
        ? { reason: "javaHomeInvalidDir", javaHome: javaHome.value, envVar: javaHome.envVar }
        : { reason: "noJavaOnPath" };
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
