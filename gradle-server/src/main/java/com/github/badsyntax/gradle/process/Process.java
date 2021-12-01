package com.github.badsyntax.gradle.process;

import com.github.badsyntax.gradle.exceptions.ProcessException;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public class Process implements AutoCloseable {
	public static final Boolean IS_WINDOWS = System.getProperty("os.name").toLowerCase().contains("windows");
	private static Runtime runtime = Runtime.getRuntime();
	private File workingDir;
	private String windowsCommand;
	private String unixCommand;
	private ProcessOutput processOutput;

	public Process(File workingDir) {
		this.workingDir = workingDir;
	}

	public synchronized void setWindowsCommand(String command) {
		this.windowsCommand = command;
	}

	public synchronized void setUnixCommand(String command) {
		this.unixCommand = command;
	}

	public static synchronized void kill(String pid) throws IOException {
		if (Boolean.TRUE.equals(IS_WINDOWS)) {
			runtime.exec(String.format("taskkill /f /pid %s", pid));
		} else {
			runtime.exec(String.format("kill -9 %s", pid));
		}
	}

	public synchronized void exec(String... args) throws IOException, ProcessException {
		ProcessBuilder processBuilder = new ProcessBuilder(buildCommand(args));
		processBuilder.directory(workingDir);
		Map<String, String> env = processBuilder.environment();
		// use the same java runtime to execute wrapper
		env.put("JAVA_HOME", System.getProperty("java.home"));
		java.lang.Process process = processBuilder.start();
		this.processOutput = new ProcessOutput(new BufferedReader(new InputStreamReader(process.getInputStream())),
				new BufferedReader(new InputStreamReader(process.getErrorStream())));
	}

	private synchronized List<String> buildCommand(String[] args) throws ProcessException {
		String command = Boolean.TRUE.equals(IS_WINDOWS) ? windowsCommand : unixCommand;
		if (command == null) {
			throw new ProcessException("No command is set");
		}
		Path commandPath = Paths.get(workingDir.getAbsolutePath(), command);
		ArrayList<String> commandList = new ArrayList<>();
		commandList.add(commandPath.toAbsolutePath().toString());
		commandList.addAll(Arrays.asList(args));
		return commandList;
	}

	public synchronized ProcessOutput getProcessOutput() {
		return processOutput;
	}

	@Override
	public synchronized void close() throws IOException {
		this.processOutput.close();
	}
}
