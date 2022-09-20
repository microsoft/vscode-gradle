// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { GradleClient } from "../client";

export interface IProjectCreationMetadata {
    isAdvanced: boolean;
    totalSteps: number;
    projectLanguage?: ProjectLanguage;
    projectType?: ProjectType;
    scriptDSL?: string;
    testFramework?: TestFramework;
    projectName: string; // default: folderName
    sourcePackageName?: string; //default: folderName
    targetFolder: string;
    steps: IProjectCreationStep[];
    nextStep?: IProjectCreationStep;
    client: GradleClient;
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
    APPLICATION = "application",
    LIBRARY = "library",
    GRADLE_PLUGIN = "gradle-plugin",
}

export enum ProjectLanguage {
    JAVA = "java",
    KOTLIN = "kotlin",
    GROOVY = "groovy",
    SCALA = "scala",
    CPP = "cpp",
}

export enum TestFramework {
    TESTNG = "testng",
    SPOCK = "spock",
    JUNIT_JUPITER = "junit-jupiter",
}
