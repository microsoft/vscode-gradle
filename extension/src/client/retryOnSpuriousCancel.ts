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
 * (see grpc/grpc-node#2872) is retried once. Only safe for idempotent or
 * read-only calls: when the workaround triggers, the server detected a
 * truncated request frame and reset the stream before doing any work, so a
 * single retry will not produce duplicate side-effects.
 *
 * The function preserves the original error (the last attempt's error is
 * thrown) and only swallows a retry when the predicate explicitly allows it.
 */
export async function retryOnSpuriousCancel<T>(
    operationName: string,
    operation: () => Promise<T>,
    isRetryable: (err: grpc.ServiceError) => boolean = defaultIsRetryable,
    options: { maxAttempts?: number; logger?: RetryLogger } = {}
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 2;
    let lastErr: grpc.ServiceError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (err) {
            const e = err as grpc.ServiceError;
            lastErr = e;
            if (attempt < maxAttempts && isRetryable(e)) {
                options.logger?.debug(
                    `${operationName}: spurious CANCELLED on attempt ${attempt}/${maxAttempts}, retrying once`
                );
                continue;
            }
            throw err;
        }
    }
    throw lastErr!;
}
