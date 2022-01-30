import * as vscode from "vscode";
import { GradleConfig } from "../proto/gradle_pb";
import { RootProject } from "../rootProject/RootProject";

type AutoDetect = "on" | "off";

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

export function getJdtConfigJavaHome(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("jdt.ls.java.home", null);
}

export function getConfigJavaImportGradleJavaHome(): string | null {
    return vscode.workspace.getConfiguration("java").get<string | null>("import.gradle.java.home", null);
}

export function getConfigGradleJavaHome(): string | null {
    return getConfigJavaImportGradleJavaHome() || getJdtConfigJavaHome() || getConfigJavaHome();
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

export function getGradleConfig(): GradleConfig {
    const gradleConfig = new GradleConfig();
    const gradleHome = getConfigJavaImportGradleHome();
    const gradleUserHome = getConfigJavaImportGradleUserHome();
    const gradleJvmArguments = getConfigJavaImportGradleJvmArguments();
    const gradleVersion = getConfigJavaImportGradleVersion();
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
