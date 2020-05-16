package com.github.badsyntax.gradletasks.exceptions;

public class GradleProjectBuilderException extends Exception {
  private static final long serialVersionUID = 1L;

  public GradleProjectBuilderException(String message) {
    super(message);
  }

  public GradleProjectBuilderException(String message, Throwable cause) {
    super(message, cause);
  }
}
