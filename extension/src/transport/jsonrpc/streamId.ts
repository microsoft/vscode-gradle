// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Monotonic stream-id allocator. Each in-flight streaming RPC
 * (`getBuild`, `runBuild`) gets a unique id so the client can
 * demultiplex incoming `gradle/*\/reply` notifications back to the
 * right caller.
 */

let next = 1;

export function nextStreamId(): number {
    const id = next;
    next = next === Number.MAX_SAFE_INTEGER ? 1 : next + 1;
    return id;
}
