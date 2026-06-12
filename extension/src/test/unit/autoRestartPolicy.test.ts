// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { shouldAutoRestart } from "../../server/autoRestartPolicy";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

describe(suiteName("shouldAutoRestart"), () => {
    const MAX = 3;

    it("allows restarts while under the per-session attempt budget", () => {
        assert.strictEqual(shouldAutoRestart(false, 0, MAX), true);
        assert.strictEqual(shouldAutoRestart(false, 1, MAX), true);
        assert.strictEqual(shouldAutoRestart(false, 2, MAX), true);
    });

    it("stops once the attempt budget is exhausted", () => {
        assert.strictEqual(shouldAutoRestart(false, 3, MAX), false);
        assert.strictEqual(shouldAutoRestart(false, 4, MAX), false);
    });

    it("never restarts while the server is being disposed", () => {
        assert.strictEqual(shouldAutoRestart(true, 0, MAX), false);
        assert.strictEqual(shouldAutoRestart(true, 2, MAX), false);
    });
});
