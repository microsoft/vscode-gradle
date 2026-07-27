// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { GRADLE_SERVER_BASE_JVM_OPTS } from "../../constant";
import { appendGradleServerOpts } from "../../server/serverUtil";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

describe(suiteName("appendGradleServerOpts"), () => {
    it("uses the required opts when no user opts are configured", () => {
        assert.strictEqual(appendGradleServerOpts(undefined, GRADLE_SERVER_BASE_JVM_OPTS), GRADLE_SERVER_BASE_JVM_OPTS);
    });

    it("preserves user opts before the required server opts", () => {
        const userOpts = "-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=8888";

        assert.strictEqual(
            appendGradleServerOpts(userOpts, GRADLE_SERVER_BASE_JVM_OPTS),
            `${userOpts} ${GRADLE_SERVER_BASE_JVM_OPTS}`
        );
    });

    it("preserves user opts before debug and required server opts", () => {
        const userOpts = "-Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=8888";
        const debugOpts =
            "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=8089 " + GRADLE_SERVER_BASE_JVM_OPTS;

        assert.strictEqual(appendGradleServerOpts(userOpts, debugOpts), `${userOpts} ${debugOpts}`);
    });
});
