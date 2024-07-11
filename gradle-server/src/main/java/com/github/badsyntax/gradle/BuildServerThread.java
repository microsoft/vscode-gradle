package com.github.badsyntax.gradle;

import com.microsoft.java.bs.core.Launcher;
import java.nio.file.Paths;
public class BuildServerThread implements Runnable {

	private String bundleDirectory;

	private final String pipeName;

	public BuildServerThread(String pipeName, String bundleDirectory) {
		this.pipeName = pipeName;
		this.bundleDirectory = bundleDirectory;
	}

	@Override
	public void run() {
		System.setProperty("plugin.dir", getBuildServerPluginPath());
		String[] args = {"--pipe=" + this.pipeName};
		Launcher.main(args);
	}

	private String getBuildServerPluginPath() {
		return Paths.get(bundleDirectory, "plugins").toString();
	}
}
