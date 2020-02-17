package com.github.badsyntax.gradletasks.server.handlers.exceptions;

public class MessageRouterException extends Exception {
  public MessageRouterException(String message) {
    super(message);
  }

  public MessageRouterException(String message, Throwable cause) {
    super(message, cause);
  }
}
