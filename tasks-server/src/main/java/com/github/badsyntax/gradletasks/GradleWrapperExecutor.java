package com.github.badsyntax.gradletasks;

import com.github.badsyntax.gradletasks.exceptions.GradleWrapperException;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.stream.Collectors;

public class GradleWrapperExecutor {
  private File projectRoot;

  public GradleWrapperExecutor(File projectRoot) {
    this.projectRoot = projectRoot;
  }

  public BufferedReader exec(String... args) throws GradleWrapperException {
    try {
      if (args.length == 0) {
        throw new GradleWrapperException("No args supplied");
      }
      String command = "./gradlew " + String.join(" ", args);
      Process process = Runtime.getRuntime().exec(command, null, projectRoot);
      BufferedReader stdErr = new BufferedReader(new InputStreamReader(process.getErrorStream()));
      BufferedReader stdOut = new BufferedReader(new InputStreamReader(process.getInputStream()));
      String stdErrString = stdErr.lines().collect(Collectors.joining());
      stdErr.close();
      if (stdErrString.length() > 0) {
        throw new GradleWrapperException(
            String.format("Error running gradle wrapper: %s", stdErrString));
      }
      return stdOut;
    } catch (IOException e) {
      throw new GradleWrapperException(
          String.format("Error running gradle wrapper: %s", e.getMessage()));
    }
  }
}
