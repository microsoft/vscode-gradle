// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { DefaultTaskDefinition } from "./types";

export async function setDefault(): Promise<void> {
    await vscode.commands.executeCommand("setContext", "gradle:defaultView", true);
}

export async function unsetDefault(): Promise<void> {
    await vscode.commands.executeCommand("setContext", "gradle:defaultView", false);
}

export function generateDefaultTaskDefinitions(): DefaultTaskDefinition[] {
    const result = [];
    result.push(getDefaultTaskDefinition("init", "build setup", "Initializes a new Gradle build."));
    result.push(getDefaultTaskDefinition("wrapper", "build setup", "Generates Gradle wrapper files."));
    result.push(
        getDefaultTaskDefinition(
            "buildEnvironment",
            "help",
            "Displays all buildscript dependencies declared in root project."
        )
    );
    result.push(
        getDefaultTaskDefinition("dependencies", "help", "Displays all dependencies declared in root project.")
    );
    result.push(
        getDefaultTaskDefinition(
            "dependencyInsight",
            "help",
            "Displays the insight into a specific dependency in root project."
        )
    );
    result.push(getDefaultTaskDefinition("help", "help", "Displays a help message."));
    result.push(getDefaultTaskDefinition("javaToolchains", "help", "Displays the detected java toolchains."));
    result.push(
        getDefaultTaskDefinition("outgoingVariants", "help", "Displays the outgoing variants of root project.")
    );
    result.push(getDefaultTaskDefinition("projects", "help", "Displays the sub-projects of root project."));
    result.push(getDefaultTaskDefinition("properties", "help", "Displays the properties of root project."));
    result.push(getDefaultTaskDefinition("tasks", "help", "Displays the tasks runnable from root project."));
    return result;
}

export function getDefaultTaskDefinition(name: string, group: string, description: string): DefaultTaskDefinition {
    return {
        name: name,
        group: group,
        description: description,
    };
}
