// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { buildServerProcessExitInfo, classifyServerStderr } from "../../server/serverProcessExitInfo";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

describe(suiteName("buildServerProcessExitInfo"), () => {
    it("captures the exit code on a code-based exit", () => {
        const info = buildServerProcessExitInfo(1, null, 2);
        assert.deepStrictEqual(info, { code: 1, signal: null, autoRestartAttempt: 2 });
    });

    it("captures the signal name on a signal-based termination", () => {
        const info = buildServerProcessExitInfo(null, "SIGKILL", 0);
        assert.deepStrictEqual(info, { code: null, signal: "SIGKILL", autoRestartAttempt: 0 });
    });

    it("round-trips through JSON so the exit code survives in dataMsg", () => {
        const dataMsg = JSON.stringify(buildServerProcessExitInfo(0, null, 0));
        assert.deepStrictEqual(JSON.parse(dataMsg), { code: 0, signal: null, autoRestartAttempt: 0 });
    });

    it("omits diagnostics when none are provided", () => {
        const info = buildServerProcessExitInfo(1, null, 0, {});
        assert.deepStrictEqual(info, { code: 1, signal: null, autoRestartAttempt: 0 });
    });

    it("includes startup diagnostics when provided", () => {
        const info = buildServerProcessExitInfo(1, null, 0, {
            durationMs: 263,
            connected: false,
            javaMajor: 11,
            javaSource: "pathFallback",
            stderrSignature: "unsupportedClassVersion",
        });
        assert.deepStrictEqual(info, {
            code: 1,
            signal: null,
            autoRestartAttempt: 0,
            durationMs: 263,
            connected: false,
            javaMajor: 11,
            javaSource: "pathFallback",
            stderrSignature: "unsupportedClassVersion",
        });
    });

    it("keeps a connected=true diagnostic distinguishable from omitted", () => {
        const info = buildServerProcessExitInfo(null, "SIGTERM", 0, { connected: true });
        assert.strictEqual(info.connected, true);
    });
});

describe(suiteName("classifyServerStderr"), () => {
    it("returns 'none' for an empty tail", () => {
        assert.strictEqual(classifyServerStderr([]), "none");
    });

    it("detects an incompatible JDK (UnsupportedClassVersionError)", () => {
        const tail = [
            "Error: LinkageError occurred while loading main class com.github.badsyntax.gradle.GradleServer",
            "java.lang.UnsupportedClassVersionError: com/github/badsyntax/gradle/GradleServer has been compiled by a more recent version of the Java Runtime (class file version 61.0), this version of the Java Runtime only recognizes class file versions up to 55.0",
        ];
        assert.strictEqual(classifyServerStderr(tail), "unsupportedClassVersion");
    });

    it("detects an unusable JVM launch (Java 8 rejecting --add-opens)", () => {
        const tail = [
            "Unrecognized option: --add-opens=java.base/java.util=ALL-UNNAMED",
            "Error: Could not create the Java Virtual Machine.",
        ];
        assert.strictEqual(classifyServerStderr(tail), "jvmCreateFailed");
    });

    it("detects a missing classpath dependency", () => {
        assert.strictEqual(
            classifyServerStderr(["java.lang.NoClassDefFoundError: org/slf4j/LoggerFactory"]),
            "noClassDefFound"
        );
    });

    it("detects a missing required launcher param", () => {
        assert.strictEqual(
            classifyServerStderr(["java.lang.IllegalArgumentException: pipe is required and can not be empty"]),
            "missingRequiredParam"
        );
    });

    it("falls back to 'other' for unrecognized output", () => {
        assert.strictEqual(classifyServerStderr(["some unrelated warning"]), "other");
    });
});
