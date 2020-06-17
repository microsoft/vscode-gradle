package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.cancellation.CancellationHandler;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.github.badsyntax.gradle.exceptions.GradleTaskRunnerException;
import com.google.common.base.Strings;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.UnsupportedVersionException;
import org.gradle.tooling.events.OperationType;
import org.gradle.tooling.events.ProgressListener;
import org.gradle.tooling.exceptions.UnsupportedBuildArgumentException;

public class GradleRunner {
  private static final String JAVA_TOOL_OPTIONS_ENV = "JAVA_TOOL_OPTIONS";

  private String projectDir;
  private List<String> args;
  private GradleConfig gradleConfig;
  private String cancellationKey;
  private Boolean colorOutput;
  private int javaDebugPort;
  private OutputStream standardOutputStream;
  private OutputStream standardErrorStream;
  private InputStream standardInputStream;
  private ProgressListener progressListener;

  public GradleRunner(
      String projectDir,
      List<String> args,
      GradleConfig gradleConfig,
      String cancellationKey,
      Boolean colorOutput,
      int javaDebugPort) {
    this.projectDir = projectDir;
    this.args = args;
    this.gradleConfig = gradleConfig;
    this.cancellationKey = cancellationKey;
    this.colorOutput = colorOutput;
    this.javaDebugPort = javaDebugPort;
  }

  public GradleRunner(
      String projectDir, List<String> args, GradleConfig gradleConfig, String cancellationKey) {
    this(projectDir, args, gradleConfig, cancellationKey, true, 0);
  }

  public GradleRunner setStandardOutputStream(OutputStream standardOutputStream) {
    this.standardOutputStream = standardOutputStream;
    return this;
  }

  public GradleRunner setStandardInputStream(InputStream standardInputStream) {
    this.standardInputStream = standardInputStream;
    return this;
  }

  public GradleRunner setStandardErrorStream(OutputStream standardErrorStream) {
    this.standardErrorStream = standardErrorStream;
    return this;
  }

  public GradleRunner setProgressListener(ProgressListener progressListener) {
    this.progressListener = progressListener;
    return this;
  }

  public void run()
      throws GradleConnectionException, BuildCancelledException, BuildException,
          UnsupportedVersionException, UnsupportedBuildArgumentException, IllegalStateException,
          IOException, GradleTaskRunnerException {
    GradleConnector gradleConnector = GradleProjectConnector.build(projectDir, gradleConfig);
    try (ProjectConnection connection = gradleConnector.connect()) {
      runCommand(connection);
    } finally {
      CancellationHandler.clearRunToken(cancellationKey);
    }
  }

  private void runCommand(ProjectConnection connection)
      throws GradleTaskRunnerException, IOException {
    Set<OperationType> progressEvents = new HashSet<>();
    progressEvents.add(OperationType.PROJECT_CONFIGURATION);
    progressEvents.add(OperationType.TASK);
    progressEvents.add(OperationType.TRANSFORM);

    BuildLauncher build =
        connection
            .newBuild()
            .withCancellationToken(CancellationHandler.getRunCancellationToken(cancellationKey))
            .addProgressListener(progressListener, progressEvents)
            .setStandardOutput(standardOutputStream)
            .setStandardError(standardErrorStream)
            .setColorOutput(colorOutput)
            .withArguments(args);

    if (this.standardInputStream != null) {
      build.setStandardInput(standardInputStream);
    }

    if (javaDebugPort != 0) {
      build.setEnvironmentVariables(buildJavaEnvVarsWithJwdp(javaDebugPort));
    }

    if (!Strings.isNullOrEmpty(gradleConfig.getJvmArguments())) {
      build.setJvmArguments(gradleConfig.getJvmArguments());
    }

    build.run();
  }

  private static Map<String, String> buildJavaEnvVarsWithJwdp(int javaDebugPort) {
    HashMap<String, String> envVars = new HashMap<>(System.getenv());
    envVars.put(
        JAVA_TOOL_OPTIONS_ENV,
        String.format(
            "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:%d",
            javaDebugPort));
    return envVars;
  }
}
