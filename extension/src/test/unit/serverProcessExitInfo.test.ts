// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { buildServerProcessExitInfo } from "../../server/serverProcessExitInfo";

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
});
