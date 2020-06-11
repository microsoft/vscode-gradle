package com.github.badsyntax.gradle.exceptions;

public class GradleWrapperException extends Exception {
  private static final long serialVersionUID = 1L;

  public GradleWrapperException(String message) {
    super(message);
  }

  public GradleWrapperException(String message, Throwable cause) {
    super(message, cause);
  }
}
