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
    "No Java executable found, please consider to configure your 'java.jdt.ls.java.home' setting or set JAVA_HOME in your path or put a Java executable in your path.";

export const OPT_RESTART = "Restart";

export enum CompletionKinds {
    DEPENDENCY_GROUP = "dependency_group",
    DEPENDENCY_ARTIFACT = "dependency_artifact",
    DEPENDENCY_VERSION = "dependency_version",
    METHOD_CALL = "method_call",
    PROPERTY = "property",
}
