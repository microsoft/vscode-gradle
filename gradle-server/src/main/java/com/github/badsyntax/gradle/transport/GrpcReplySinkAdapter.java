// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport;

import io.grpc.Status;
import io.grpc.stub.StreamObserver;

/**
 * Adapts a gRPC {@link StreamObserver} to a {@link TaskReplySink} so that
 * existing handler logic can be transport-agnostic while the JSON-RPC transport
 * is being introduced.
 *
 * <p>
 * Behavior is byte-equivalent to the previous in-line gRPC code paths:
 * {@code onNext} is forwarded as-is, {@code onCompleted} is forwarded, and
 * {@code onError} maps {@link TaskException.Type} back to the same
 * {@link Status} codes that {@code ErrorMessageBuilder} produced before this
 * refactor (default {@link Status#INTERNAL} for unmapped types).
 */
public final class GrpcReplySinkAdapter<T> implements TaskReplySink<T> {

	private final StreamObserver<T> delegate;

	public GrpcReplySinkAdapter(StreamObserver<T> delegate) {
		this.delegate = delegate;
	}

	@Override
	public void onNext(T reply) {
		delegate.onNext(reply);
	}

	@Override
	public void onCompleted() {
		delegate.onCompleted();
	}

	@Override
	public void onError(TaskException error) {
		delegate.onError(toStatus(error.getType()).withDescription(error.getMessage()).asRuntimeException());
	}

	private static Status toStatus(TaskException.Type type) {
		switch (type) {
			case NOT_FOUND :
				return Status.NOT_FOUND;
			case CANCELLED :
				return Status.CANCELLED;
			case UNKNOWN :
				return Status.UNKNOWN;
			case INTERNAL :
			default :
				return Status.INTERNAL;
		}
	}
}
