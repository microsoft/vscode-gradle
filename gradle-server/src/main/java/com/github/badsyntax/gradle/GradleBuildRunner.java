package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleBuildRunnerException;
import com.google.common.base.Strings;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
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
	private String additionalToolOptions;

	public GradleBuildRunner(String projectDir, List<String> args, GradleConfig gradleConfig, String cancellationKey,
			Boolean colorOutput, int javaDebugPort, Boolean javaDebugCleanOutputCache, String additionalToolOptions) {
		this.projectDir = projectDir;
		this.args = args;
		this.gradleConfig = gradleConfig;
		this.cancellationKey = cancellationKey;
		this.colorOutput = colorOutput;
		this.javaDebugPort = javaDebugPort;
		this.javaDebugCleanOutputCache = javaDebugCleanOutputCache;
		this.additionalToolOptions = additionalToolOptions;
	}

	public GradleBuildRunner(String projectDir, List<String> args, GradleConfig gradleConfig, String cancellationKey) {
		this(projectDir, args, gradleConfig, cancellationKey, true, 0, false, "");
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

		Path debugInitScriptPath = null;
		if (Boolean.TRUE.equals(isDebugging)) {
			debugInitScriptPath = createDebugInitScript(javaDebugPort);
		}

		BuildLauncher build = connection.newBuild().withCancellationToken(cancellationToken)
				.addProgressListener(progressListener, progressEvents).setStandardOutput(standardOutputStream)
				.setStandardError(standardErrorStream).setColorOutput(colorOutput)
				.withArguments(buildArguments(isDebugging, debugInitScriptPath));

		if (this.standardInputStream != null) {
			build.setStandardInput(standardInputStream);
		}

		Map<String, String> envVars = buildJavaEnvVarsWithToolOptions(additionalToolOptions);

		if (envVars != null) {
			build.setEnvironmentVariables(envVars);
		}

		if (!Strings.isNullOrEmpty(gradleConfig.getJvmArguments())) {
			build.setJvmArguments(gradleConfig.getJvmArguments());
		}

		if (!Strings.isNullOrEmpty(gradleConfig.getJavaHome())) {
			build.setJavaHome(new File(gradleConfig.getJavaHome()));
		}

		build.run();
	}

	private List<String> buildArguments(Boolean isDebugging, Path debugInitScriptPath)
			throws GradleBuildRunnerException {
		List<String> newArgs = new ArrayList<>(args);

		// Add init script for debugging if present
		if (debugInitScriptPath != null) {
			newArgs.addAll(0, Arrays.asList("--init-script", debugInitScriptPath.toAbsolutePath().toString()));
		}

		if (Boolean.FALSE.equals(isDebugging) || Boolean.FALSE.equals(javaDebugCleanOutputCache)) {
			return newArgs;
		}
		int taskIndex = -1;
		// Account for the init-script args added above
		int offset = debugInitScriptPath != null ? 2 : 0;
		for (int i = offset; i < newArgs.size(); i++) {
			if (isTask(newArgs.get(i))) {
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
		List<String> parts = new LinkedList<>(Arrays.asList(newArgs.get(taskIndex).split(":")));
		String taskName = parts.get(parts.size() - 1);
		parts.remove(parts.size() - 1);

		String capitalizedTaskName = taskName.substring(0, 1).toUpperCase() + taskName.substring(1);
		parts.add("clean" + capitalizedTaskName);

		String cleanTaskName = String.join(":", parts);

		newArgs.add(taskIndex, cleanTaskName);

		logger.warn("Adding {} to ensure task output is cleared before debugging", cleanTaskName);

		return newArgs;
	}

	private static boolean isTask(String argument) {
		return !argument.startsWith("-");
	}

	/**
	 * Creates or updates a Gradle init script that applies debug JVM arguments only
	 * to JavaExec and Test tasks. This prevents the debug agent from being attached
	 * to compilation tasks and other Java processes.
	 *
	 * Uses a stable file path to allow Gradle configuration cache to work properly.
	 * The file is only rewritten if the content has changed (i.e., the debug port
	 * changed).
	 */
	private static Path createDebugInitScript(int javaDebugPort) throws IOException {
		String jdwpArgs = String.format("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:%d",
				javaDebugPort);
		String initScriptContent = String.format(
				"allprojects {\n" + "    tasks.withType(JavaExec) {\n" + "        jvmArgs '%s'\n" + "    }\n"
						+ "    tasks.withType(Test) {\n" + "        jvmArgs '%s'\n" + "    }\n" + "}",
				jdwpArgs, jdwpArgs);

		// Use a stable path with port number to allow Gradle configuration cache reuse
		// and prevent race conditions between concurrent builds with different ports
		String tempDir = System.getProperty("java.io.tmpdir");
		if (tempDir == null || tempDir.isEmpty()) {
			tempDir = "/tmp";
		}
		String fileName = String.format("vscode-gradle-debug-init-%d.gradle", javaDebugPort);
		Path initScriptPath = Path.of(tempDir, fileName);

		// Only write the file if it doesn't exist or the content has changed
		boolean needsWrite = true;
		if (Files.exists(initScriptPath)) {
			try {
				String existingContent = Files.readString(initScriptPath);
				needsWrite = !existingContent.equals(initScriptContent);
			} catch (IOException e) {
				// File may have been deleted between exists check and read, proceed with write
				logger.debug("Could not read existing init script, will create new one: {}", e.getMessage());
				needsWrite = true;
			}
		}

		if (needsWrite) {
			Files.writeString(initScriptPath, initScriptContent);
			logger.info("Created/updated debug init script at: {}", initScriptPath);
		} else {
			logger.info("Reusing existing debug init script at: {}", initScriptPath);
		}

		return initScriptPath;
	}

	/**
	 * Builds environment variables with JAVA_TOOL_OPTIONS for additional tool
	 * options. Note: Debug agent is no longer set via JAVA_TOOL_OPTIONS to prevent
	 * it from being applied to all Java processes (e.g., compilation). Instead,
	 * debugging is configured via Gradle init script to target only JavaExec and
	 * Test tasks.
	 */
	private static Map<String, String> buildJavaEnvVarsWithToolOptions(String additionalToolOptions) {
		if (additionalToolOptions == null || additionalToolOptions.isEmpty()) {
			return null;
		}
		HashMap<String, String> envVars = new HashMap<>(System.getenv());
		envVars.put(JAVA_TOOL_OPTIONS_ENV, additionalToolOptions);
		return envVars;
	}
}
