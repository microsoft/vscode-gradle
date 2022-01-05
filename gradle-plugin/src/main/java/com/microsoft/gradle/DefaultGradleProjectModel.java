// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleProjectContent;
import com.microsoft.gradle.api.GradleProjectModel;
import com.microsoft.gradle.api.GradleTask;
import java.io.Serializable;
import java.util.List;

public class DefaultGradleProjectModel implements Serializable, GradleProjectModel {
	private boolean isRoot;
	private String projectPath;
	private List<GradleProjectModel> subProjects;
	private List<GradleTask> tasks;
	private GradleProjectContent gradleProjectContent;

	public DefaultGradleProjectModel(boolean isRoot, String projectPath, List<GradleProjectModel> subProjects,
			List<GradleTask> tasks, GradleProjectContent gradleProjectContent) {
		this.isRoot = isRoot;
		this.projectPath = projectPath;
		this.subProjects = subProjects;
		this.tasks = tasks;
		this.gradleProjectContent = gradleProjectContent;
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

	public GradleProjectContent getGradleProjectContent() {
		return this.gradleProjectContent;
	}

}
