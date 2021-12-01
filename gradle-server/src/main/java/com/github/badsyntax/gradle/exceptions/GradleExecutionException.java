// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.exceptions;

public class GradleExecutionException extends Exception {
	private static final long serialVersionUID = 1L;

	public GradleExecutionException(String message) {
		super(message);
	}

	public GradleExecutionException(String message, Throwable cause) {
		super(message, cause);
	}
}
