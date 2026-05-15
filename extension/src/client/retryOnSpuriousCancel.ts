import * as grpc from "@grpc/grpc-js";

/**
 * Pluggable logger surface. Only `debug` is used; the call sites pass the
 * extension `logger` but tests can pass a stub.
 */
export interface RetryLogger {
    debug(...messages: string[]): void;
}

/**
 * Default eligibility predicate: retry only on the generic `CANCELLED` status.
 * Callers can pass a narrower predicate (e.g. server-streaming callers also
 * require zero data observed, a short duration, and that the user did not
 * cancel).
 */
const defaultIsRetryable = (err: grpc.ServiceError | undefined): boolean => err?.code === grpc.status.CANCELLED;

/**
 * Wrap a gRPC call so a spurious CANCELLED caused by a Node.js http2 race
 * (see grpc/grpc-node#2872) is retried once. The race shows up as the server
 * deframer reporting "Encountered end-of-stream mid-frame" on the request
 * stream and the client surfacing a synthetic CANCELLED in well under a
 * second, before any reply data has been observed.
 *
 * Intended for idempotent or read-only RPCs (e.g. read-only metadata
 * queries, server-streaming refreshes, and idempotent cancellation calls).
 * Callers that drive side-effecting work MUST either avoid this helper or
 * pass a narrow `isRetryable` predicate that rules out attempts which could
 * have produced server-side effects (for example by requiring zero data
 * received, a sub-second duration, and that the user did not cancel).
 *
 * The function preserves the original error: the last attempt's error is
 * thrown, and a retry is only taken when `isRetryable` returns true.
 */
export async function retryOnSpuriousCancel<T>(
    operationName: string,
    operation: () => Promise<T>,
    isRetryable: (err: grpc.ServiceError) => boolean = defaultIsRetryable,
    options: { maxAttempts?: number; logger?: RetryLogger } = {}
): Promise<T> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    let lastErr: grpc.ServiceError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (err) {
            const e = err as grpc.ServiceError;
            lastErr = e;
            if (attempt < maxAttempts && isRetryable(e)) {
                options.logger?.debug(
                    `${operationName}: spurious CANCELLED on attempt ${attempt}/${maxAttempts}, retrying`
                );
                continue;
            }
            throw err;
        }
    }
    throw lastErr!;
}
