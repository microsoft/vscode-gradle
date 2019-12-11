package com.github.badsyntax.gradletasks;

public class CliAppException extends Exception {
    public CliAppException(String message) {
        super(message);
    }

    public CliAppException(String message, Throwable cause) {
        super(message, cause);
    }
}
