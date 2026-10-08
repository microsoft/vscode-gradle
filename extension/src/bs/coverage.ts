// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { escapeGroovySingleQuoted } from "./groovy";
import { DELEGATED_TEST_COVERAGE_CAPABILITY } from "../java-test-runner.api";

/**
 * The subset of the Test Runner for Java extension API that this module
 * inspects. Versions released before capability declaration expose no
 * `capabilities` member at all.
 */
export interface JavaTestRunnerCapabilities {
    capabilities?: readonly string[];
}

/**
 * Whether the installed Test Runner for Java extension drives delegated
 * coverage runs, that is, whether it hands the runner an output directory
 * through `IRunTestContext.coverage` and analyzes the `.exec` files written
 * there once the run finishes.
 *
 * Both halves of the feature ship separately, so registering the Coverage
 * profile against a host that lacks this capability would surface a run
 * profile that can only fail. Keeping the profile hidden until the host
 * advertises support removes that ordering hazard entirely.
 */
export function supportsDelegatedTestCoverage(api: JavaTestRunnerCapabilities | undefined): boolean {
    return api?.capabilities?.includes(DELEGATED_TEST_COVERAGE_CAPABILITY) === true;
}

/**
 * Enable JaCoCo on every `Test` task without changing the user's build files,
 * writing isolated execution data (`.exec`) under `execOutputDir`.
 *
 * This intentionally does NOT run or reconfigure `jacocoTestReport`: the raw
 * `.exec` files are the coverage boundary. vscode-java-test (JDTLS) loads and
 * analyzes them against the project's compiled classes, producing the VS Code
 * coverage objects. There is no client-side report generation or XML parsing.
 *
 * Execution data is isolated per Gradle project and per `Test` task, so a
 * single run may produce multiple `.exec` files (multi-project builds or
 * multiple Test tasks) that the analyzer merges.
 */
export function getCoverageInitScriptLines(execOutputDir: string): string[] {
    const executionDataDir = escapeGroovySingleQuoted(execOutputDir);
    return [
        "allprojects { p ->",
        "    p.plugins.withId('java') {",
        "        if (!p.plugins.hasPlugin('jacoco')) {",
        "            p.apply plugin: 'jacoco'",
        "            p.jacoco { toolVersion = '0.8.15' }",
        "        }",
        "        def coverageProjectId = p.path.replaceAll('[^A-Za-z0-9]', '_') + '_' + Integer.toHexString(p.path.hashCode())",
        `        def coverageExecDir = new File('${executionDataDir}', coverageProjectId)`,
        "        p.tasks.withType(Test).configureEach { t ->",
        "            def execName = t.name.replaceAll('[^A-Za-z0-9]', '_') + '_' + Integer.toHexString(t.path.hashCode())",
        "            t.extensions.getByType(org.gradle.testing.jacoco.plugins.JacocoTaskExtension).destinationFile = new File(coverageExecDir, 'jacoco' + execName + '.exec')",
        "        }",
        "    }",
        "}",
    ];
}
