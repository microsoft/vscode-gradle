// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";
import * as jdkUtils from "../../util/jdkUtils";
import { findValidJavaHome } from "../../util/config";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
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
