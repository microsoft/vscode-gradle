// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { TaskServerClient } from "../client";

export interface IProjectCreationMetadata {
    isAdvanced: boolean;
    totalSteps: number;
    projectType?: ProjectType;
    scriptDSL?: string;
    testFramework?: TestFramework;
    projectName: string; // default: folderName
    sourcePackageName?: string; //default: folderName
    targetFolder: string;
    steps: IProjectCreationStep[];
    nextStep?: IProjectCreationStep;
    client: TaskServerClient;
}

export interface IProjectCreationStep {
    run(metadata: IProjectCreationMetadata): Promise<StepResult>;
}

export enum StepResult {
    NEXT,
    STOP,
    PREVIOUS,
}

export enum ProjectType {
    JAVA_APPLICATION = "java-application",
    JAVA_LIBRARY = "java-library",
    JAVA_GRADLE_PLUGIN = "java-gradle-plugin",
}

export enum TestFramework {
    TESTNG = "testng",
    SPOCK = "spock",
    JUNIT_JUPITER = "junit-jupiter",
}
