// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleTask;
import java.io.Serializable;

public class DefaultGradleTask implements Serializable, GradleTask {
	private String name;
	private String group;
	private String path;
	private String project;
	private String buildFile;
	private String rootProject;
	private String description;
	private boolean debuggable;

	public DefaultGradleTask(String name, String group, String path, String project, String buildFile,
			String rootProject, String description, boolean debuggable) {
		this.name = name;
		this.group = group;
		this.path = path;
		this.project = project;
		this.buildFile = buildFile;
		this.rootProject = rootProject;
		this.description = description;
		this.debuggable = debuggable;
	}

	public String getName() {
		return name;
	}

	public String getGroup() {
		return group;
	}

	public String getPath() {
		return path;
	}

	public String getProject() {
		return project;
	}

	public String getBuildFile() {
		return buildFile;
	}

	public String getRootProject() {
		return rootProject;
	}

	public String getDescription() {
		return description;
	}

	public boolean getDebuggable() {
		return debuggable;
	}

	public void setDebuggable(boolean debuggable) {
		this.debuggable = debuggable;
	}
}
