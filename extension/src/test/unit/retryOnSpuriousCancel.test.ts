/* eslint-disable @typescript-eslint/no-explicit-any */

import * as assert from "assert";
import * as sinon from "sinon";
import * as grpc from "@grpc/grpc-js";
import { retryOnSpuriousCancel, RetryLogger } from "../../client/retryOnSpuriousCancel";

function cancelledError(extra: Partial<grpc.ServiceError> = {}): grpc.ServiceError {
    return Object.assign(new Error("Call cancelled"), {
        code: grpc.status.CANCELLED,
        details: "Call cancelled",
        metadata: new grpc.Metadata(),
        ...extra,
    }) as grpc.ServiceError;
}

function statusError(code: grpc.status): grpc.ServiceError {
    return Object.assign(new Error(`status ${code}`), {
        code,
        details: `status ${code}`,
        metadata: new grpc.Metadata(),
    }) as grpc.ServiceError;
}

describe("retryOnSpuriousCancel", () => {
    let logger: RetryLogger & { debug: sinon.SinonSpy };

    beforeEach(() => {
        logger = { debug: sinon.spy() };
    });

    it("returns the operation result on first success without retrying", async () => {
        const op = sinon.stub().resolves("ok");

        const result = await retryOnSpuriousCancel("Op", op, undefined, { logger });

        assert.strictEqual(result, "ok");
        sinon.assert.calledOnce(op);
        sinon.assert.notCalled(logger.debug);
    });

    it("retries once on spurious CANCELLED and returns the second result", async () => {
        const op = sinon.stub();
        op.onFirstCall().rejects(cancelledError());
        op.onSecondCall().resolves("recovered");

        const result = await retryOnSpuriousCancel("Op", op, undefined, { logger });

        assert.strictEqual(result, "recovered");
        sinon.assert.calledTwice(op);
        sinon.assert.calledOnce(logger.debug);
        assert.ok(
            (logger.debug.firstCall.args[0] as string).includes("Op: spurious CANCELLED on attempt 1/2"),
            "retry log should identify the operation and attempt index"
        );
    });

    it("throws the final error when both attempts fail with CANCELLED", async () => {
        const first = cancelledError({ details: "first" });
        const second = cancelledError({ details: "second" });
        const op = sinon.stub();
        op.onFirstCall().rejects(first);
        op.onSecondCall().rejects(second);

        const thrown = await retryOnSpuriousCancel("Op", op, undefined, { logger }).then(
            () => undefined,
            (e) => e as grpc.ServiceError
        );

        sinon.assert.calledTwice(op);
        assert.ok(thrown, "should have thrown");
        assert.strictEqual(thrown!.details, "second", "the last attempt's error should propagate");
    });

    it("does not retry on non-CANCELLED errors (default predicate)", async () => {
        const op = sinon.stub().rejects(statusError(grpc.status.INTERNAL));

        const thrown = await retryOnSpuriousCancel("Op", op, undefined, { logger }).then(
            () => undefined,
            (e) => e as grpc.ServiceError
        );

        sinon.assert.calledOnce(op);
        sinon.assert.notCalled(logger.debug);
        assert.strictEqual(thrown!.code, grpc.status.INTERNAL);
    });

    it("respects a custom predicate that rejects the retry", async () => {
        const op = sinon.stub().rejects(cancelledError());
        const isRetryable = sinon.stub().returns(false);

        const thrown = await retryOnSpuriousCancel("Op", op, isRetryable, { logger }).then(
            () => undefined,
            (e) => e as grpc.ServiceError
        );

        sinon.assert.calledOnce(op);
        sinon.assert.calledOnce(isRetryable);
        sinon.assert.notCalled(logger.debug);
        assert.strictEqual(thrown!.code, grpc.status.CANCELLED);
    });

    it("passes the original error to the custom predicate", async () => {
        const err = cancelledError({ details: "probe" });
        const op = sinon.stub();
        op.onFirstCall().rejects(err);
        op.onSecondCall().resolves("ok");
        const isRetryable = sinon.stub().returns(true);

        await retryOnSpuriousCancel("Op", op, isRetryable, { logger });

        sinon.assert.calledOnceWithExactly(isRetryable, err);
    });

    it("works without a logger (debug calls are best-effort)", async () => {
        const op = sinon.stub();
        op.onFirstCall().rejects(cancelledError());
        op.onSecondCall().resolves("ok");

        const result = await retryOnSpuriousCancel("Op", op);

        assert.strictEqual(result, "ok");
        sinon.assert.calledTwice(op);
    });

    it("honors a custom maxAttempts value", async () => {
        const op = sinon.stub().rejects(cancelledError());

        const thrown = await retryOnSpuriousCancel("Op", op, undefined, { logger, maxAttempts: 3 }).then(
            () => undefined,
            (e) => e
        );

        sinon.assert.calledThrice(op);
        sinon.assert.calledTwice(logger.debug); // retry log between attempts 1->2 and 2->3
        assert.ok(thrown);
    });
});
