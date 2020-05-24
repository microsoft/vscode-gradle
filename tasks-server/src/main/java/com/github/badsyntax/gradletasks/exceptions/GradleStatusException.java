package com.github.badsyntax.gradletasks.exceptions;

public class GradleStatusException extends Exception {
  private static final long serialVersionUID = 1L;

  public GradleStatusException(String message) {
    super(message);
  }

  public GradleStatusException(String message, Throwable cause) {
    super(message, cause);
  }
}
