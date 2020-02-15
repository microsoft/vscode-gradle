package com.github.badsyntax.gradletasks.server.actions.exceptions;

public class ActionRunnerException extends Exception {
  public ActionRunnerException(String message) {
    super(message);
  }

  public ActionRunnerException(String message, Throwable cause) {
    super(message, cause);
  }
}
