package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleBuildRunnerException;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.google.common.base.Strings;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleBuildRunner {
  private static final String JAVA_TOOL_OPTIONS_ENV = "JAVA_TOOL_OPTIONS";
  private static final Logger logger = LoggerFactory.getLogger(GradleBuildRunner.class.getName());

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
    if (args.size() == 0) {
      throw new GradleBuildRunnerException("No args supplied");
    }
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

    Boolean isDebugging = javaDebugPort != 0;

    BuildLauncher build =
        connection
            .newBuild()
            .withCancellationToken(cancellationToken)
            .addProgressListener(progressListener, progressEvents)
            .setStandardOutput(standardOutputStream)
            .setStandardError(standardErrorStream)
            .setColorOutput(colorOutput)
            .withArguments(buildArguments(isDebugging));

    if (this.standardInputStream != null) {
      build.setStandardInput(standardInputStream);
    }

    if (Boolean.TRUE.equals(isDebugging)) {
      build.setEnvironmentVariables(buildJavaEnvVarsWithJwdp(javaDebugPort));
    }

    if (!Strings.isNullOrEmpty(gradleConfig.getJvmArguments())) {
      build.setJvmArguments(gradleConfig.getJvmArguments());
    }

    build.run();
  }

  private List<String> buildArguments(Boolean isDebugging) throws GradleBuildRunnerException {
    if (Boolean.FALSE.equals(isDebugging)) {
      return args;
    }
    if (args.size() > 1) {
      throw new GradleBuildRunnerException("Unexpected multiple tasks when debugging");
    }
    // Prepend a clean task to ensure any build cache is cleared to ensure
    // debugging can occur for test tasks.
    String capitalizedTaskName =
        args.get(0).substring(0, 1).toUpperCase() + args.get(0).substring(1);
    String cleanTaskName = "clean" + capitalizedTaskName;
    List<String> newArgs = new ArrayList<String>(args);
    newArgs.add(0, cleanTaskName);

    logger.warn("Adding {} to ensure task output is cleared when debugging", cleanTaskName);

    return newArgs;
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
