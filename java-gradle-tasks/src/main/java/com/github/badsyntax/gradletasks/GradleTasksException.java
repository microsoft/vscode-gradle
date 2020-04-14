package com.github.badsyntax.gradletasks;

public class GradleTasksException extends Exception {
  private static final long serialVersionUID = 1L;

  public GradleTasksException(String message) {
    super(message);
  }

  public GradleTasksException(String message, Throwable cause) {
    super(message, cause);
  }
}
