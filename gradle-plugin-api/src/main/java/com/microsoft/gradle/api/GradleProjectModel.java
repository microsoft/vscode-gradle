// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.api;

import java.util.List;
import org.gradle.tooling.model.Model;

public interface GradleProjectModel extends Model {
	boolean getIsRoot();
	String getProjectPath();
	List<GradleProjectModel> getSubProjects();
	List<GradleTask> getTasks();
	GradleDependencyNode getDependencyNode();
	List<String> getPlugins();
	List<GradleClosure> getClosures();
	List<String> getScriptClasspaths();
}
