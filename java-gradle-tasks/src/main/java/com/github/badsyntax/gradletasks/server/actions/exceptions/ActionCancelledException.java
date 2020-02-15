package com.github.badsyntax.gradletasks.server.actions.exceptions;

public class ActionCancelledException extends Exception {
    public ActionCancelledException(String message) {
        super(message);
    }

    public ActionCancelledException(String message, Throwable cause) {
        super(message, cause);
    }
}
