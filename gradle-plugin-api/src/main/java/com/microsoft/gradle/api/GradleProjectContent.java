// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.api;

import java.util.List;

public interface GradleProjectContent {
	GradleDependencyNode getDependencyNode();
	List<String> getPlugins();
	List<GradleClosure> getClosures();
	List<String> getScriptClasspaths();
}
