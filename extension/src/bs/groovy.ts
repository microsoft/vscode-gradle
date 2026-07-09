// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Escape a string so it can be embedded inside a Groovy single-quoted literal.
 * Only backslashes and single quotes need escaping (Windows paths contain
 * backslashes, so this matters).
 */
export function escapeGroovySingleQuoted(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
