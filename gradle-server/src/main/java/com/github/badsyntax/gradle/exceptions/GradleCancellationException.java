package com.github.badsyntax.gradle.exceptions;

public class GradleCancellationException extends Exception {
	private static final long serialVersionUID = 1L;

	public GradleCancellationException(String message) {
		super(message);
	}

	public GradleCancellationException(String message, Throwable cause) {
		super(message, cause);
	}
}
