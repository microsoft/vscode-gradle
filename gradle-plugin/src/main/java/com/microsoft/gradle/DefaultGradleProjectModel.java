// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleClosure;
import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleProjectModel;
import java.io.Serializable;
import java.util.List;

public class DefaultGradleProjectModel implements Serializable, GradleProjectModel {
	private GradleDependencyNode node;
	private List<String> plugins;
	private List<GradleClosure> closures;
	private List<String> scriptClasspaths;
	private List<String> debugTasks;

	public DefaultGradleProjectModel(GradleDependencyNode node, List<String> plugins, List<GradleClosure> closures,
			List<String> scriptClasspaths, List<String> debugTasks) {
		this.node = node;
		this.plugins = plugins;
		this.closures = closures;
		this.scriptClasspaths = scriptClasspaths;
		this.debugTasks = debugTasks;
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

	public List<String> getDebugTasks() {
		return this.debugTasks;
	}
}
