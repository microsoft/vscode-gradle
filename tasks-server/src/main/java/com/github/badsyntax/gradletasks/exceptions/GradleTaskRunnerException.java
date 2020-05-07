package com.github.badsyntax.gradletasks.exceptions;

public class GradleTaskRunnerException extends Exception {
  private static final long serialVersionUID = 1L;

  public GradleTaskRunnerException(String message) {
    super(message);
  }

  public GradleTaskRunnerException(String message, Throwable cause) {
    super(message, cause);
  }
}
