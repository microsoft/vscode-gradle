// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.api;

import org.gradle.tooling.BuildAction;
import org.gradle.tooling.BuildController;
import org.gradle.tooling.model.gradle.BasicGradleProject;
import org.gradle.tooling.model.gradle.GradleBuild;

public class GradleDependencyModelAction implements BuildAction<GradleDependencyNode> {
	private final String projectPath;

	public GradleDependencyModelAction(String projectPath) {
		this.projectPath = normalizeProjectPath(projectPath);
	}

	private static String normalizeProjectPath(String projectPath) {
		if (projectPath == null) {
			return ":";
		}
		StringBuilder normalizedPath = new StringBuilder();
		for (String segment : projectPath.split(":")) {
			if (!segment.isEmpty()) {
				normalizedPath.append(":").append(segment);
			}
		}
		return normalizedPath.length() == 0 ? ":" : normalizedPath.toString();
	}

	@Override
	public GradleDependencyNode execute(BuildController controller) {
		GradleBuild build = controller.getBuildModel();
		return getDependencyNode(controller, build);
	}

	private GradleDependencyNode getDependencyNode(BuildController controller, GradleBuild build) {
		for (BasicGradleProject project : build.getProjects()) {
			if (this.projectPath.equals(project.getPath())) {
				GradleDependencyModel dependencyModel = controller.getModel(project, GradleDependencyModel.class);
				return dependencyModel.getDependencyNode();
			}
		}
		for (GradleBuild includedBuild : build.getIncludedBuilds()) {
			GradleDependencyNode dependencyNode = getDependencyNode(controller, includedBuild);
			if (dependencyNode != null) {
				return dependencyNode;
			}
		}
		return null;
	}
}
