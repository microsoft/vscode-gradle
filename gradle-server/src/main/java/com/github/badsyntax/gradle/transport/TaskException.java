// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport;

/**
 * Transport-neutral exception used by handlers to signal a terminal failure on
 * a {@link TaskReplySink}. The {@link Type} maps to gRPC {@code Status} codes
 * today and to JSON-RPC error codes in a later phase, keeping the wire mapping
 * out of handler logic.
 */
public class TaskException extends RuntimeException {

	private static final long serialVersionUID = 1L;

	public enum Type {
		NOT_FOUND, CANCELLED, UNKNOWN, INTERNAL
	}

	private final Type type;

	public TaskException(Type type, String message, Throwable cause) {
		super(message, cause);
		this.type = type;
	}

	public TaskException(Type type, String message) {
		this(type, message, null);
	}

	public Type getType() {
		return type;
	}
}
