import { execSync } from "child_process";
import { JAVA_FILENAME } from "jdk-utils";
import * as vscode from "vscode";
import { GradleConfig } from "../proto/gradle_pb";
import { RootProject } from "../rootProject/RootProject";
import * as fse from "fs-extra";
import * as path from "path";
import { findDefaultRuntimeFromSettings, getMajorVersion, listJdks } from "./jdkUtils";
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

    // Search valid JDKs from env.JAVA_HOME, env.PATH, SDKMAN, jEnv, jabba, common directories
    const javaRuntimes = await listJdks();
    const validJdks = javaRuntimes.find((r) => r.version!.major >= REQUIRED_JDK_VERSION);
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

export function redHatJavaInstalled(): boolean {
    return !!vscode.extensions.getExtension("redhat.java");
}

export function getRedHatJavaEmbeddedJRE(): string | undefined {
    if (!redHatJavaInstalled()) {
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
