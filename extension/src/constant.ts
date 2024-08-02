// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Context {
    export const ACTIVATION_CONTEXT_KEY = "gradle:extensionActivated";
}

export const GRADLE_BUILD_FILE_CHANGE = "gradle.buildFileChanged";

export const GRADLE_BUILD_FILE_OPEN = "gradle.buildFileOpened";

export const GRADLE_PROPERTIES_FILE_CHANGE = "gradle.propertiesFileChanged";

export const GRADLE_COMPLETION = "gradle.completion";

export const VSCODE_TRIGGER_COMPLETION = "editor.action.triggerSuggest";

export const GRADLE_BUILD_FILE_NAMES = ["build.gradle", "settings.gradle", "build.gradle.kts", "settings.gradle.kts"];

export const NO_JAVA_EXECUTABLE =
    "JDK 17 or higher is required. Please set a valid Java home path to 'java.jdt.ls.java.home' setting or JAVA_HOME environment variable. Or ensure a valid Java executable is in your PATH.";

export const OPT_RESTART = "Restart";

export const GRADLE_SERVER_BASE_JVM_OPTS =
    "--add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.lang.invoke=ALL-UNNAMED --add-opens=java.prefs/java.util.prefs=ALL-UNNAMED --add-opens=java.base/java.nio.charset=ALL-UNNAMED --add-opens=java.base/java.net=ALL-UNNAMED --add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED";

export enum CompletionKinds {
    DEPENDENCY_GROUP = "dependency_group",
    DEPENDENCY_ARTIFACT = "dependency_artifact",
    DEPENDENCY_VERSION = "dependency_version",
    METHOD_CALL = "method_call",
    PROPERTY = "property",
}
