package com.github.badsyntax.gradle;

import java.io.File;
import java.io.IOException;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
public class BuildServerThread implements Runnable {

	private String bundleDirectory;

	private final String pipeName;

	private final String javaHome;
	public BuildServerThread(String pipeName, String bundleDirectory, String javaHome) {
		this.pipeName = pipeName;
		this.bundleDirectory = bundleDirectory;
		this.javaHome = javaHome;
	}

	@Override
	public void run() {
		try {
			String[] classpaths = getBuildServerClasspath();

			String pluginPath = getBuildServerPluginPath();

			List<String> command = new ArrayList<>();
			command.add(this.javaHome);
			if (Boolean.parseBoolean(System.getenv("DEBUG_GRADLE_BUILD_SERVER"))) {
				command.add("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=8989");
			}
			command.add("--add-opens=java.base/java.lang=ALL-UNNAMED");
			command.add("--add-opens=java.base/java.io=ALL-UNNAMED");
			command.add("--add-opens=java.base/java.util=ALL-UNNAMED");
			command.add("-Dplugin.dir=" + pluginPath);
			command.add("-cp");
			command.add(String.join(getClasspathSeparator(), classpaths));
			command.add("com.microsoft.java.bs.core.Launcher");
			command.add(this.pipeName);

			ProcessBuilder build = new ProcessBuilder(command);
			build.start();
		} catch (IOException e) {
			e.printStackTrace();
		}
	}

	private String[] getBuildServerClasspath() {
		return new String[]{Paths.get(bundleDirectory, "server.jar").toString(),
				Paths.get(bundleDirectory, "runtime").toString() + File.separatorChar + "*"};
	}

	private String getBuildServerPluginPath() {
		return Paths.get(bundleDirectory, "plugins").toString();
	}

	private String getClasspathSeparator() {
		String os = System.getProperty("os.name").toLowerCase();

		if (os.contains("win")) {
			return ";";
		}
		return ":";
	}
}
