package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleBuildRunnerException;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.google.common.base.Strings;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.events.OperationType;
import org.gradle.tooling.events.ProgressListener;

public class GradleBuildRunner {
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

  public GradleBuildRunner(
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

  public GradleBuildRunner(
      String projectDir, List<String> args, GradleConfig gradleConfig, String cancellationKey) {
    this(projectDir, args, gradleConfig, cancellationKey, true, 0);
  }

  public GradleBuildRunner setStandardOutputStream(OutputStream standardOutputStream) {
    this.standardOutputStream = standardOutputStream;
    return this;
  }

  public GradleBuildRunner setStandardInputStream(InputStream standardInputStream) {
    this.standardInputStream = standardInputStream;
    return this;
  }

  public GradleBuildRunner setStandardErrorStream(OutputStream standardErrorStream) {
    this.standardErrorStream = standardErrorStream;
    return this;
  }

  public GradleBuildRunner setProgressListener(ProgressListener progressListener) {
    this.progressListener = progressListener;
    return this;
  }

  public void run() throws GradleConnectionException, IOException, GradleBuildRunnerException {
    GradleConnector gradleConnector = GradleProjectConnector.build(projectDir, gradleConfig);
    try (ProjectConnection connection = gradleConnector.connect()) {
      runBuild(connection);
    } finally {
      GradleBuildCancellation.clearToken(cancellationKey);
    }
  }

  private void runBuild(ProjectConnection connection)
      throws GradleBuildRunnerException, IOException {
    Set<OperationType> progressEvents = new HashSet<>();
    progressEvents.add(OperationType.PROJECT_CONFIGURATION);
    progressEvents.add(OperationType.TASK);
    progressEvents.add(OperationType.TRANSFORM);

    CancellationToken cancellationToken = GradleBuildCancellation.buildToken(cancellationKey);

    BuildLauncher build =
        connection
            .newBuild()
            .withCancellationToken(cancellationToken)
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
