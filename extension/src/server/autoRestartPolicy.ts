// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Decide whether the gradle-server may be auto-restarted after an unexpected
 * exit. Kept as a pure function so the bounded-retry policy is unit-testable
 * independently of process spawning: we stop restarting while the server is
 * being disposed (extension shutdown) or once the per-session attempt budget is
 * exhausted, at which point the caller surfaces the manual recovery prompt.
 */
export function shouldAutoRestart(disposing: boolean, attempts: number, maxAttempts: number): boolean {
    return !disposing && attempts < maxAttempts;
}
