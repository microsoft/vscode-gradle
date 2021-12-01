package com.github.badsyntax.gradle.exceptions;

public class GradleBuildRunnerException extends Exception {
	private static final long serialVersionUID = 1L;

	public GradleBuildRunnerException(String message) {
		super(message);
	}

	public GradleBuildRunnerException(String message, Throwable cause) {
		super(message, cause);
	}
}
