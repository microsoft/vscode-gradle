// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Structured diagnostics recorded with the `serverProcessExit` telemetry event.
 *
 * These fields are JSON-encoded into the event's `dataMsg` because the telemetry
 * sink only persists `kind` and `dataMsg`. The gradle-server exit code used to be
 * sent in `data3`, which is dropped, so unexpected exits could not be attributed
 * (non-zero exit code vs. signal-kill). All fields are low-cardinality
 * diagnostics and never carry user data.
 */
export interface ServerProcessExitInfo {
    /** Process exit code, or null when the process was terminated by a signal. */
    code: number | null;
    /** Terminating signal name (e.g. "SIGKILL"), or null on a code-based exit. */
    signal: string | null;
    /**
     * Bounded auto-restart attempt number (1..N) while self-healing is in
     * progress, or 0 once recovery is abandoned (attempt budget exhausted or the
     * server is being disposed) and the user is prompted to reload.
     */
    autoRestartAttempt: number;
}

/**
 * Assemble the {@link ServerProcessExitInfo} payload from a Node child-process
 * exit. Kept as a pure function so the telemetry contract is unit-testable
 * independently of process spawning.
 */
export function buildServerProcessExitInfo(
    code: number | null,
    signal: NodeJS.Signals | null,
    autoRestartAttempt: number
): ServerProcessExitInfo {
    return {
        code,
        signal: signal ?? null,
        autoRestartAttempt,
    };
}
