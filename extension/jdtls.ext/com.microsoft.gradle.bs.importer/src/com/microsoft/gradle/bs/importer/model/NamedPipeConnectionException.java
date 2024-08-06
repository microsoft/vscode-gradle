package com.microsoft.gradle.bs.importer.model;

public class NamedPipeConnectionException extends RuntimeException {
  public NamedPipeConnectionException(String message, int maxAttempts) {
    super(String.format("%s, Max attempts: %d", message, maxAttempts));
  }
}
