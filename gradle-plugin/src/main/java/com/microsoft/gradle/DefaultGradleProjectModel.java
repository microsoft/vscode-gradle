// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleClosure;
import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleProjectModel;
import com.microsoft.gradle.api.GradleTask;
import java.io.Serializable;
import java.util.List;

public class DefaultGradleProjectModel implements Serializable, GradleProjectModel {
	private boolean isRoot;
	private String projectPath;
	private List<GradleProjectModel> subProjects;
	private List<GradleTask> tasks;
	private GradleDependencyNode node;
	private List<String> plugins;
	private List<GradleClosure> closures;
	private List<String> scriptClasspaths;

	public DefaultGradleProjectModel(boolean isRoot, String projectPath, List<GradleProjectModel> subProjects,
			List<GradleTask> tasks, GradleDependencyNode node, List<String> plugins, List<GradleClosure> closures,
			List<String> scriptClasspaths) {
		this.isRoot = isRoot;
		this.projectPath = projectPath;
		this.subProjects = subProjects;
		this.tasks = tasks;
		this.node = node;
		this.plugins = plugins;
		this.closures = closures;
		this.scriptClasspaths = scriptClasspaths;
	}

	public boolean getIsRoot() {
		return this.isRoot;
	}

	public String getProjectPath() {
		return this.projectPath;
	}

	public List<GradleProjectModel> getSubProjects() {
		return this.subProjects;
	}

	public List<GradleTask> getTasks() {
		return this.tasks;
	}

	public GradleDependencyNode getDependencyNode() {
		return this.node;
	}

	public List<String> getPlugins() {
		return this.plugins;
	}

	public List<GradleClosure> getClosures() {
		return this.closures;
	}

	public List<String> getScriptClasspaths() {
		return this.scriptClasspaths;
	}
}
