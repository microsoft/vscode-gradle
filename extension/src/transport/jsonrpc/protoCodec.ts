// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Base64 codec for protobuf wire bytes. Used by `GradleJsonRpcClient` to
 * serialize requests and deserialize replies on the JSON-RPC envelope.
 *
 * Mirrors `JsonRpcCodec.encode/decode` on the Java side.
 */

export function encodeProto(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64");
}

export function decodeProto(base64: string): Uint8Array {
    return new Uint8Array(Buffer.from(base64, "base64"));
}
