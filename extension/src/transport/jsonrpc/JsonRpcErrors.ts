// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ResponseError } from "vscode-jsonrpc";

/**
 * JSON-RPC error codes that form the wire contract with the Java side
 * (`com.github.badsyntax.gradle.transport.jsonrpc.JsonRpcCodec`). Pinned
 * here so TS callers can dispatch on the same numeric codes the server
 * emits; renumbering on either side requires a coordinated change.
 */
export const JsonRpcErrors = {
    /** Mirrors the legacy transport's `UNKNOWN` status. Used for proto parse failures and unmapped server errors. */
    UNKNOWN: -32000,
    /** Mirrors the legacy transport's `NOT_FOUND` status. */
    NOT_FOUND: -32001,
    /** Mirrors the legacy transport's `CANCELLED` status. */
    CANCELLED: -32002,
    /** Mirrors the legacy transport's `INTERNAL` status (LSP4J reserved code). */
    INTERNAL: -32603,
} as const;

/**
 * Lightweight surface used by callers that previously typed errors as
 * the legacy transport's service-error type. `message` / `code` mirror what `ResponseError`
 * exposes; `details` is provided for source-compat with logger call sites
 * that read `err.details || err.message`.
 */
export interface GradleRpcError extends Error {
    code: number;
    details?: string;
}

export function isGradleRpcError(err: unknown): err is GradleRpcError {
    return err instanceof Error && typeof (err as GradleRpcError).code === "number";
}

export function isResponseError(err: unknown): err is ResponseError<unknown> {
    return err instanceof ResponseError;
}

export function isCancelled(err: unknown): boolean {
    return isGradleRpcError(err) && err.code === JsonRpcErrors.CANCELLED;
}

export function isNotFound(err: unknown): boolean {
    return isGradleRpcError(err) && err.code === JsonRpcErrors.NOT_FOUND;
}

export function isUnknown(err: unknown): boolean {
    return isGradleRpcError(err) && err.code === JsonRpcErrors.UNKNOWN;
}

/**
 * Convert a `vscode-jsonrpc` `ResponseError` into the `GradleRpcError`
 * shape callers consume. Preserves the numeric code and message; sets
 * `details` to the JSON-RPC `data` field stringified if present, so
 * existing `err.details || err.message` logging paths keep working.
 */
export function toGradleRpcError(err: unknown): GradleRpcError {
    if (isResponseError(err)) {
        const wrapped = new Error(err.message) as GradleRpcError;
        wrapped.code = err.code;
        if (err.data !== undefined && err.data !== null) {
            wrapped.details = typeof err.data === "string" ? err.data : JSON.stringify(err.data);
        }
        return wrapped;
    }
    if (isGradleRpcError(err)) {
        return err;
    }
    const fallback = new Error(err instanceof Error ? err.message : String(err)) as GradleRpcError;
    fallback.code = JsonRpcErrors.UNKNOWN;
    return fallback;
}
