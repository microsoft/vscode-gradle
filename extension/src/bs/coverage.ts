// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { escapeGroovySingleQuoted } from "./groovy";

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
