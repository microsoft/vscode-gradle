// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport;

/**
 * Transport-neutral reply sink used by request handlers to deliver intermediate
 * messages, terminal success and terminal errors. Concrete implementations
 * bridge this abstraction to a specific wire protocol (e.g. gRPC
 * {@code StreamObserver}, JSON-RPC {@code CompletableFuture} + notifications).
 *
 * <p>
 * Handlers must not assume anything about the wire format and should map domain
 * errors to {@link TaskException} so the adapter can translate them
 * consistently.
 */
public interface TaskReplySink<T> {
	/** Emit an intermediate or terminal message. May be called multiple times. */
	void onNext(T reply);

	/** Signal successful completion. Must be called at most once. */
	void onCompleted();

	/**
	 * Signal terminal failure. Must be called at most once and is mutually
	 * exclusive with {@link #onCompleted()}.
	 */
	void onError(TaskException error);
}
