package com.github.badsyntax.gradletasks;

import com.github.badsyntax.gradletasks.exceptions.GradleWrapperException;
import com.github.badsyntax.gradletasks.process.Process;
import com.github.badsyntax.gradletasks.process.ProcessOutput;
import java.io.File;
import java.io.IOException;
import java.util.stream.Collectors;

public class GradleWrapper {
  private File projectRoot;
  private static String GRADLE_WRAPPER_UNIX = "gradlew";
  private static String GRADLE_WRAPPER_WINDOWS = "gradlew.bat";

  public GradleWrapper(File projectRoot) {
    this.projectRoot = projectRoot;
  }

  public synchronized String exec(String... args) throws GradleWrapperException {
    try {
      if (args.length == 0) {
        throw new GradleWrapperException("No wrapper args supplied");
      }
      Process process = new Process(projectRoot);
      process.setUnixCommand(GRADLE_WRAPPER_UNIX);
      process.setWindowsCommand(GRADLE_WRAPPER_WINDOWS);
      process.exec(args);
      ProcessOutput processOutput = process.getProcessOutput();
      String stdErrString = processOutput.getStdErr().lines().collect(Collectors.joining("\n"));
      String stdOutString = processOutput.getStdOut().lines().collect(Collectors.joining("\n"));
      process.close();
      if (stdErrString.length() > 0) {
        throw new GradleWrapperException(
            String.format("Error running gradle wrapper: %s", stdErrString));
      }
      return stdOutString;
    } catch (IOException | RuntimeException e) {
      throw new GradleWrapperException(
          String.format("Error running gradle wrapper: %s", e.getMessage()));
    }
  }
}
