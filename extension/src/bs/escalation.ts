// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

/**
 * Command id used to (re-)run the current tests through the "Delegate Test to
 * Gradle" profile. Contributed in package.json and registered in Extension.ts.
 */
export const RETRY_WITH_GRADLE_COMMAND = "gradle.retryTestWithGradle";

/**
 * Signatures in a failed test run's output that Gradle delegation is known to
 * resolve. These fall into two buckets:
 *
 *  1. JPMS / module-access failures — the default (JDT) launcher builds a flat
 *     classpath and can hit `module ... does not "opens"/"exports"`, reflective
 *     `IllegalAccessException` / `InaccessibleObjectException`, or split-package
 *     errors that Gradle's module-aware test runtime handles correctly.
 *  2. Stale / unprocessed resources — the default launcher runs against the JDT
 *     output folder, which may not have had `processResources` applied (filtered
 *     properties, generated files, `src/main/resources` copied to the runtime
 *     classpath). A Gradle `test` run regenerates these.
 */
const DELEGATION_FIXABLE_PATTERNS: RegExp[] = [
    // JPMS access errors
    /\bdoes not "?opens?"?\b/i,
    /\bdoes not "?exports?"?\b/i,
    /\bIllegalAccessException\b/,
    /\bInaccessibleObjectException\b/,
    /module .* does not (?:open|export)/i,
    /because module .* does not/i,
    /package .* is declared in module/i,
    /cannot access class .* because module/i,
    // Stale / unprocessed resources
    /Could not (?:find|load|read) .*\.(?:properties|yml|yaml|xml)\b/i,
    /Resource .* not found on the (?:test )?classpath/i,
    /processResources/i,
];

/**
 * Returns true when the given failure message contains a signature that
 * delegating the test run to Gradle is expected to fix.
 */
export function isDelegationFixableFailure(message: string | undefined): boolean {
    if (!message) {
        return false;
    }
    return DELEGATION_FIXABLE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Human-readable reason describing why Gradle delegation may fix the failure.
 * Returns undefined when no known signature is present.
 */
export function describeDelegationFix(message: string | undefined): string | undefined {
    if (!message) {
        return undefined;
    }
    if (/opens?|exports?|IllegalAccessException|InaccessibleObjectException|module/i.test(message)) {
        return "This looks like a Java module-access error. Running the tests through Gradle uses the build's module-aware runtime, which usually resolves it.";
    }
    if (/processResources|classpath|\.(properties|yml|yaml|xml)\b/i.test(message)) {
        return "This looks like a missing or stale test resource. Running the tests through Gradle applies `processResources`, which usually resolves it.";
    }
    if (isDelegationFixableFailure(message)) {
        return "Running the tests through Gradle may resolve this failure.";
    }
    return undefined;
}

/**
 * When a (default) test run fails with a delegation-fixable signature, surface a
 * one-click "Retry with Gradle" affordance. Clicking it invokes `rerun`, which is
 * expected to launch the same tests through the Gradle delegate profile.
 *
 * No-op when the failure is not delegation-fixable, so callers can invoke this
 * unconditionally from their failure path.
 */
export async function offerRetryWithGradle(
    message: string | undefined,
    rerun: () => void | Promise<void>
): Promise<void> {
    const reason = describeDelegationFix(message);
    if (!reason) {
        return;
    }
    const action = "Retry with Gradle";
    const selection = await vscode.window.showErrorMessage(`Test run failed. ${reason}`, action);
    if (selection === action) {
        await rerun();
    }
}
