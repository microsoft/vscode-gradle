// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleClosure;
import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleProjectContent;
import java.io.Serializable;
import java.util.List;

public class DefaultGradleProjectContent implements Serializable, GradleProjectContent {
	private GradleDependencyNode node;
	private List<String> plugins;
	private List<GradleClosure> closures;
	private List<String> scriptClasspaths;

	public DefaultGradleProjectContent(GradleDependencyNode node, List<String> plugins, List<GradleClosure> closures,
			List<String> scriptClasspaths) {
		this.node = node;
		this.plugins = plugins;
		this.closures = closures;
		this.scriptClasspaths = scriptClasspaths;
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
