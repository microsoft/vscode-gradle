package com.github.badsyntax.gradletasks.exceptions;

public class GradleConnectionException extends Exception {
  private static final long serialVersionUID = 1L;

  public GradleConnectionException(String message) {
    super(message);
  }

  public GradleConnectionException(String message, Throwable cause) {
    super(message, cause);
  }
}
