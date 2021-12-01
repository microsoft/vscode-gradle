package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleExecutionException;
import com.github.badsyntax.gradle.exceptions.ProcessException;
import com.github.badsyntax.gradle.process.Process;
import com.github.badsyntax.gradle.process.ProcessOutput;
import com.github.badsyntax.gradle.utils.Utils;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Collectors;

public class GradleWrapper implements GradleExecution {
	private File projectRoot;
	private static final String GRADLE_WRAPPER_UNIX = "gradlew";
	private static final String GRADLE_WRAPPER_WINDOWS = "gradlew.bat";
	private static final Path GRADLE_WRAPPER_PROPERTIES_PATH = Paths.get("gradle", "wrapper",
			"gradle-wrapper.properties");

	public GradleWrapper(File projectRoot) {
		this.projectRoot = projectRoot;
	}

	public synchronized String exec(String... args) throws GradleExecutionException {
		try {
			if (args.length == 0) {
				throw new GradleExecutionException("No wrapper args supplied");
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
				throw new GradleExecutionException(String.format("Error running gradle wrapper: %s", stdErrString));
			}
			return stdOutString;
		} catch (IOException | ProcessException e) {
			throw new GradleExecutionException(String.format("Error running gradle wrapper: %s", e.getMessage()));
		}
	}

	public static boolean hasValidWrapper(File projectRoot) {
		if (!Utils.isValidFile(projectRoot)) {
			return false;
		}
		File propertiesFile = projectRoot.toPath().resolve(GRADLE_WRAPPER_PROPERTIES_PATH).toFile();
		boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
		File wrapperFile = isWindows
				? projectRoot.toPath().resolve(GRADLE_WRAPPER_WINDOWS).toFile()
				: projectRoot.toPath().resolve(GRADLE_WRAPPER_UNIX).toFile();
		return Utils.isValidFile(propertiesFile) && Utils.isValidFile(wrapperFile);
	}
}
