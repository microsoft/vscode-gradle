// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Wire-level shapes for the JSON-RPC task transport. Mirrors the Java
 * side's `transport.jsonrpc` DTOs (`GradleRequestParams`,
 * `GradleResponse`, `GradleStreamPayload`).
 *
 * `request` / `reply` / `payload` carry the base64-encoded protobuf bytes
 * of the existing `gradle.proto` messages; the proto schema continues to be
 * the single source of truth for field-level semantics.
 */

export interface GradleRequestParams {
    request: string | null;
    streamId: number | null;
}

export interface GradleResponse {
    reply: string | null;
}

export interface GradleStreamPayload {
    streamId: number;
    payload: string;
}
