package com.github.badsyntax.gradletasks.server;

public class GradleTasksServerException extends Exception {
    public GradleTasksServerException(String message) {
        super(message);
    }

    public GradleTasksServerException(String message, Throwable cause) {
        super(message, cause);
    }
}
