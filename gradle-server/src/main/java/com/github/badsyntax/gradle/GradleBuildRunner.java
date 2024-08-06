package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleBuildRunnerException;
import com.google.common.base.Strings;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
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
	private Boolean javaDebugCleanOutputCache;

	public GradleBuildRunner(String projectDir, List<String> args, GradleConfig gradleConfig, String cancellationKey,
			Boolean colorOutput, int javaDebugPort, Boolean javaDebugCleanOutputCache) {
		this.projectDir = projectDir;
		this.args = args;
		this.gradleConfig = gradleConfig;
		this.cancellationKey = cancellationKey;
		this.colorOutput = colorOutput;
		this.javaDebugPort = javaDebugPort;
		this.javaDebugCleanOutputCache = javaDebugCleanOutputCache;
	}

	public GradleBuildRunner(String projectDir, List<String> args, GradleConfig gradleConfig, String cancellationKey) {
		this(projectDir, args, gradleConfig, cancellationKey, true, 0, false);
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

	public void run() throws IOException, GradleBuildRunnerException {
		if (Boolean.TRUE.equals(args.isEmpty())) {
			throw new GradleBuildRunnerException("No args supplied");
		}
		GradleConnector gradleConnector = GradleProjectConnector.build(projectDir, gradleConfig);
		try (ProjectConnection connection = gradleConnector.connect()) {
			runBuild(connection);
		} finally {
			GradleBuildCancellation.clearToken(cancellationKey);
		}
	}

	private void runBuild(ProjectConnection connection) throws GradleBuildRunnerException, IOException {
		Set<OperationType> progressEvents = new HashSet<>();
		progressEvents.add(OperationType.PROJECT_CONFIGURATION);
		progressEvents.add(OperationType.TASK);
		progressEvents.add(OperationType.TRANSFORM);

		CancellationToken cancellationToken = GradleBuildCancellation.buildToken(cancellationKey);

		Boolean isDebugging = javaDebugPort != 0;

		BuildLauncher build = connection.newBuild().withCancellationToken(cancellationToken)
				.addProgressListener(progressListener, progressEvents).setStandardOutput(standardOutputStream)
				.setStandardError(standardErrorStream).setColorOutput(colorOutput)
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

		if (!Strings.isNullOrEmpty(gradleConfig.getJavaHome())) {
			build.setJavaHome(new File(gradleConfig.getJavaHome()));
		}

		build.run();
	}

	private List<String> buildArguments(Boolean isDebugging) throws GradleBuildRunnerException {
		if (Boolean.FALSE.equals(isDebugging) || Boolean.FALSE.equals(javaDebugCleanOutputCache)) {
			return args;
		}
		int taskIndex = -1;
		for (int i = 0; i < args.size(); i++) {
			if (isTask(args.get(i))) {
				if (taskIndex == -1) {
					taskIndex = i;
				} else {
					// there is already a task found
					throw new GradleBuildRunnerException("Unexpected multiple tasks when debugging");
				}
			}
		}
		if (taskIndex == -1) {
			throw new GradleBuildRunnerException("No task found when debugging");
		}
		List<String> parts = new LinkedList<>(Arrays.asList(args.get(taskIndex).split(":")));
		String taskName = parts.get(parts.size() - 1);
		parts.remove(parts.size() - 1);

		String capitalizedTaskName = taskName.substring(0, 1).toUpperCase() + taskName.substring(1);
		parts.add("clean" + capitalizedTaskName);

		String cleanTaskName = String.join(":", parts);

		List<String> newArgs = new ArrayList<>(args);
		newArgs.add(taskIndex, cleanTaskName);

		logger.warn("Adding {} to ensure task output is cleared before debugging", cleanTaskName);

		return newArgs;
	}

	private static boolean isTask(String argument) {
		return !argument.startsWith("-");
	}

	private static Map<String, String> buildJavaEnvVarsWithJwdp(int javaDebugPort) {
		HashMap<String, String> envVars = new HashMap<>(System.getenv());
		envVars.put(JAVA_TOOL_OPTIONS_ENV, String
				.format("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:%d", javaDebugPort));
		return envVars;
	}
}
