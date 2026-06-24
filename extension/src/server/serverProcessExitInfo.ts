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
/**
 * Low-cardinality classification of the gradle-server JVM stderr tail.
 *
 * The raw stderr can contain user file paths, so it is never sent to telemetry
 * directly. Instead we map it to one of these stable categories so a `code=1`
 * exit can be attributed (e.g. an incompatible JDK vs. an out-of-memory) from
 * field telemetry without leaking user data.
 */
export type ServerStderrSignature =
    | "none"
    | "unsupportedClassVersion"
    | "jvmCreateFailed"
    | "noClassDefFound"
    | "mainClassError"
    | "outOfMemory"
    | "missingRequiredParam"
    | "other";

/**
 * Where the JDK used to launch the gradle-server came from.
 *
 * `pathFallback` is the risky path: no validated JDK >= 17 was resolved, so the
 * launcher falls back to `JAVA_HOME`/`PATH` `java`, which may be too old to run
 * the Java 17 server jar and exit with `code=1` before connecting.
 */
export type JavaSource = "embeddedJre" | "validJavaHome" | "pathFallback" | "unknown";

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
    /** Process lifetime in milliseconds, from spawn to exit. */
    durationMs?: number;
    /**
     * Whether the JVM connected back to the task pipe before exiting. `false`
     * with a non-zero code means the server died during JVM/launcher startup,
     * before any task transport session was established (the signature of an
     * incompatible/old JDK).
     */
    connected?: boolean;
    /**
     * Major version of the JDK the extension resolved for the launcher (0 =
     * unknown). On the PATH-fallback path the extension does not resolve the
     * launcher's java, so this stays 0 there; use `stderrSignature` to attribute
     * those exits. A value `> 0 && < 17` explains a startup `code=1` directly.
     */
    javaMajor?: number;
    /** Where the JDK came from; see {@link JavaSource}. */
    javaSource?: JavaSource;
    /** Classification of the JVM stderr tail; see {@link ServerStderrSignature}. */
    stderrSignature?: ServerStderrSignature;
}

/** Optional diagnostics captured around an unexpected gradle-server exit. */
export interface ServerExitDiagnostics {
    durationMs?: number;
    connected?: boolean;
    javaMajor?: number;
    javaSource?: JavaSource;
    stderrSignature?: ServerStderrSignature;
}

/**
 * Map a captured stderr tail to a stable {@link ServerStderrSignature} so the
 * cause of a `code=1` exit is observable in telemetry without sending the raw
 * (potentially path-bearing) text. Ordered most-specific first.
 */
export function classifyServerStderr(stderrTail: ReadonlyArray<string>): ServerStderrSignature {
    if (!stderrTail || stderrTail.length === 0) {
        return "none";
    }
    const text = stderrTail.join("\n");
    if (/UnsupportedClassVersionError/.test(text)) {
        return "unsupportedClassVersion";
    }
    if (
        /Could not create the Java Virtual Machine|Unrecognized option|Invalid maximum heap size|Improperly specified VM option/.test(
            text
        )
    ) {
        return "jvmCreateFailed";
    }
    if (/OutOfMemoryError/.test(text)) {
        return "outOfMemory";
    }
    // Check the specific main-class load failure before the generic
    // NoClassDefFoundError/ClassNotFoundException below: a "could not find or
    // load main class" failure usually also prints a `Caused by:
    // ClassNotFoundException` line, which would otherwise be misclassified as
    // noClassDefFound.
    if (
        /Could not find or load main class|LinkageError occurred while loading main class|Main method not found/.test(
            text
        )
    ) {
        return "mainClassError";
    }
    if (/NoClassDefFoundError|ClassNotFoundException/.test(text)) {
        return "noClassDefFound";
    }
    if (/is required and can not be empty/.test(text)) {
        return "missingRequiredParam";
    }
    return "other";
}

/**
 * Assemble the {@link ServerProcessExitInfo} payload from a Node child-process
 * exit. Kept as a pure function so the telemetry contract is unit-testable
 * independently of process spawning. Extra startup diagnostics are optional so
 * callers (and existing tests) that only have the exit code/signal stay valid.
 */
export function buildServerProcessExitInfo(
    code: number | null,
    signal: NodeJS.Signals | null,
    autoRestartAttempt: number,
    diagnostics: ServerExitDiagnostics = {}
): ServerProcessExitInfo {
    const info: ServerProcessExitInfo = {
        code,
        signal: signal ?? null,
        autoRestartAttempt,
    };
    if (diagnostics.durationMs !== undefined) {
        info.durationMs = diagnostics.durationMs;
    }
    if (diagnostics.connected !== undefined) {
        info.connected = diagnostics.connected;
    }
    if (diagnostics.javaMajor !== undefined) {
        info.javaMajor = diagnostics.javaMajor;
    }
    if (diagnostics.javaSource !== undefined) {
        info.javaSource = diagnostics.javaSource;
    }
    if (diagnostics.stderrSignature !== undefined) {
        info.stderrSignature = diagnostics.stderrSignature;
    }
    return info;
}
