// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from "assert";
import * as sinon from "sinon";
import * as path from "path";
import * as fse from "fs-extra";
import { JAVA_FILENAME } from "jdk-utils";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";
import * as jdkUtils from "../../util/jdkUtils";
import {
    checkEnvJavaExecutable,
    findValidJavaHome,
    getMissingJavaInfo,
    readLauncherJavaHomeValue,
} from "../../util/config";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

function restoreEnv(key: string, saved: string | undefined): void {
    if (saved === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = saved;
    }
}

describe(suiteName("findValidJavaHome"), () => {
    let savedJavaHome: string | undefined;

    beforeEach(() => {
        savedJavaHome = process.env.JAVA_HOME;
        delete process.env.JAVA_HOME;
        // No java.* home settings and no java.configuration.runtimes configured,
        // so resolution falls through to the discovered-JDK scan under test.
        sinon.stub(vscode.workspace, "getConfiguration").returns({
            get: (_section: string, defaultValue?: unknown) => defaultValue ?? null,
        } as unknown as vscode.WorkspaceConfiguration);
    });

    afterEach(() => {
        if (savedJavaHome === undefined) {
            delete process.env.JAVA_HOME;
        } else {
            process.env.JAVA_HOME = savedJavaHome;
        }
        sinon.restore();
    });

    it("skips a JDK with an unresolved version instead of crashing", async () => {
        sinon.stub(jdkUtils, "listJdks").resolves([
            { homedir: "/jdk-no-version" } as any, // version === undefined
            { homedir: "/jdk17", version: { major: 17 } } as any,
        ]);
        const sendInfoStub = sinon.stub(telemetry, "sendInfo");

        const result = await findValidJavaHome();

        assert.strictEqual(result, "/jdk17");
        assert.ok(
            sendInfoStub.calledOnceWith("", sinon.match({ kind: "jdkVersionUnresolved" })),
            "expected jdkVersionUnresolved telemetry to be sent"
        );
    });

    it("returns undefined without throwing when every discovered JDK lacks a version", async () => {
        sinon.stub(jdkUtils, "listJdks").resolves([{ homedir: "/jdk-no-version" } as any]);
        sinon.stub(telemetry, "sendInfo");

        const result = await findValidJavaHome();

        assert.strictEqual(result, undefined);
    });

    it("does not emit telemetry when every discovered JDK has a resolved version", async () => {
        sinon.stub(jdkUtils, "listJdks").resolves([{ homedir: "/jdk17", version: { major: 17 } } as any]);
        const sendInfoStub = sinon.stub(telemetry, "sendInfo");

        const result = await findValidJavaHome();

        assert.strictEqual(result, "/jdk17");
        assert.strictEqual(sendInfoStub.called, false);
    });
});

describe(suiteName("checkEnvJavaExecutable"), () => {
    let savedJavaHome: string | undefined;
    let savedVscodeJavaHome: string | undefined;

    beforeEach(() => {
        savedJavaHome = process.env.JAVA_HOME;
        savedVscodeJavaHome = process.env.VSCODE_JAVA_HOME;
        delete process.env.JAVA_HOME;
        delete process.env.VSCODE_JAVA_HOME;
    });

    afterEach(() => {
        restoreEnv("JAVA_HOME", savedJavaHome);
        restoreEnv("VSCODE_JAVA_HOME", savedVscodeJavaHome);
        sinon.restore();
    });

    it("returns true when JAVA_HOME contains a java executable", () => {
        process.env.JAVA_HOME = "/opt/jdk17";
        const accessStub = sinon.stub(fse, "accessSync").returns(undefined);

        assert.strictEqual(checkEnvJavaExecutable(), true);
        assert.ok(accessStub.calledOnceWith(path.join("/opt/jdk17", "bin", JAVA_FILENAME)));
    });

    it("returns false when JAVA_HOME is set but its bin/java is missing or not executable", () => {
        process.env.JAVA_HOME = "/opt/broken";
        sinon.stub(fse, "accessSync").throws(new Error("ENOENT"));

        assert.strictEqual(checkEnvJavaExecutable(), false);
    });

    it("probes JAVA_HOME verbatim, without trimming surrounding whitespace", () => {
        process.env.JAVA_HOME = " /opt/jdk17 ";
        const accessStub = sinon.stub(fse, "accessSync").returns(undefined);

        checkEnvJavaExecutable();
        assert.ok(
            accessStub.calledOnceWith(path.join(" /opt/jdk17 ", "bin", JAVA_FILENAME)),
            "expected the probe to use the untrimmed JAVA_HOME, mirroring the launcher"
        );
    });

    it("prefers VSCODE_JAVA_HOME over JAVA_HOME, mirroring the launcher precedence", () => {
        process.env.VSCODE_JAVA_HOME = "/opt/vscode-jdk";
        process.env.JAVA_HOME = "/opt/broken";
        const accessStub = sinon.stub(fse, "accessSync").returns(undefined);

        assert.strictEqual(checkEnvJavaExecutable(), true);
        assert.ok(
            accessStub.calledOnceWith(path.join("/opt/vscode-jdk", "bin", JAVA_FILENAME)),
            "expected the probe to target VSCODE_JAVA_HOME, not JAVA_HOME"
        );
    });

    it("returns false when a set VSCODE_JAVA_HOME has no usable java, even if JAVA_HOME is valid", () => {
        process.env.VSCODE_JAVA_HOME = "/opt/broken";
        process.env.JAVA_HOME = "/opt/jdk17";
        const accessStub = sinon.stub(fse, "accessSync").throws(new Error("ENOENT"));

        assert.strictEqual(checkEnvJavaExecutable(), false);
        assert.ok(accessStub.calledOnceWith(path.join("/opt/broken", "bin", JAVA_FILENAME)));
    });
});

describe(suiteName("getMissingJavaInfo"), () => {
    let savedJavaHome: string | undefined;
    let savedVscodeJavaHome: string | undefined;

    beforeEach(() => {
        savedJavaHome = process.env.JAVA_HOME;
        savedVscodeJavaHome = process.env.VSCODE_JAVA_HOME;
        delete process.env.JAVA_HOME;
        delete process.env.VSCODE_JAVA_HOME;
    });

    afterEach(() => {
        restoreEnv("JAVA_HOME", savedJavaHome);
        restoreEnv("VSCODE_JAVA_HOME", savedVscodeJavaHome);
        sinon.restore();
    });

    it("attributes a set JAVA_HOME to an invalid directory, reporting it verbatim without trimming", () => {
        process.env.JAVA_HOME = " /opt/broken ";

        assert.deepStrictEqual(getMissingJavaInfo(), {
            reason: "javaHomeInvalidDir",
            javaHome: " /opt/broken ",
            envVar: "JAVA_HOME",
        });
    });

    it("attributes a set VSCODE_JAVA_HOME to an invalid directory, taking precedence over JAVA_HOME", () => {
        process.env.VSCODE_JAVA_HOME = "/opt/vscode-broken";
        process.env.JAVA_HOME = "/opt/jdk17";

        assert.deepStrictEqual(getMissingJavaInfo(), {
            reason: "javaHomeInvalidDir",
            javaHome: "/opt/vscode-broken",
            envVar: "VSCODE_JAVA_HOME",
        });
    });

    it("attributes an unset effective Java home to no java on PATH", () => {
        delete process.env.JAVA_HOME;
        delete process.env.VSCODE_JAVA_HOME;

        assert.deepStrictEqual(getMissingJavaInfo(), { reason: "noJavaOnPath" });
    });
});

describe(suiteName("readLauncherJavaHomeValue"), () => {
    it("reads the value verbatim on Unix, preserving quotes and whitespace", () => {
        assert.strictEqual(readLauncherJavaHomeValue('  "/opt/jdk17"  ', "linux"), '  "/opt/jdk17"  ');
    });

    it('strips quotes but preserves whitespace on Windows, mirroring %_JAVA_HOME:"=%', () => {
        assert.strictEqual(readLauncherJavaHomeValue('  "C:\\jdk17"  ', "win32"), "  C:\\jdk17  ");
    });

    it("never trims whitespace on either platform", () => {
        assert.strictEqual(readLauncherJavaHomeValue(" /opt/jdk17 ", "linux"), " /opt/jdk17 ");
        assert.strictEqual(readLauncherJavaHomeValue(" C:\\jdk17 ", "win32"), " C:\\jdk17 ");
    });
});
