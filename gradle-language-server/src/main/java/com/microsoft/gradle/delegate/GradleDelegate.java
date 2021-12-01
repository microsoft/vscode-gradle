// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.delegate;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class GradleDelegate {
	private static String PROJECT = "org.gradle.api.Project";
	private static String SETTINGS = "org.gradle.api.initialization.Settings";
	// Here to support different versions of delegate types. The values of delegate
	// types are sorted by priority
	private static Map<String, List<String>> delegateMap;

	static {
		delegateMap = new HashMap<>();
		// plugins
		delegateMap.put("application", Arrays.asList("org.gradle.api.plugins.JavaApplication",
				"org.gradle.api.plugins.ApplicationPluginConvention"));
		delegateMap.put("base", Arrays.asList("org.gradle.api.plugins.BasePluginExtension",
				"org.gradle.api.plugins.BasePluginConvention"));
		delegateMap.put("java", Arrays.asList("org.gradle.api.plugins.JavaPluginExtension",
				"org.gradle.api.plugins.JavaPluginConvention"));
		delegateMap.put("war", Arrays.asList("org.gradle.api.plugins.WarPluginConvention"));
		// basic closures
		delegateMap.put("plugins", Arrays.asList("org.gradle.plugin.use.PluginDependenciesSpec"));
		delegateMap.put("configurations", Arrays.asList("org.gradle.api.artifacts.Configuration"));
		delegateMap.put("dependencySubstitution", Arrays.asList("org.gradle.api.artifacts.DependencySubstitutions"));
		delegateMap.put("resolutionStrategy", Arrays.asList("org.gradle.api.artifacts.ResolutionStrategy"));
		delegateMap.put("artifacts", Arrays.asList("org.gradle.api.artifacts.dsl.ArtifactHandler"));
		delegateMap.put("components", Arrays.asList("org.gradle.api.artifacts.dsl.ComponentMetadataHandler"));
		delegateMap.put("modules", Arrays.asList("org.gradle.api.artifacts.dsl.ComponentModuleMetadataHandler"));
		delegateMap.put("dependencies", Arrays.asList("org.gradle.api.artifacts.dsl.DependencyHandler"));
		delegateMap.put("repositories", Arrays.asList("org.gradle.api.artifacts.dsl.RepositoryHandler"));
		delegateMap.put("publishing", Arrays.asList("org.gradle.api.publish.PublishingExtension"));
		delegateMap.put("publications", Arrays.asList("org.gradle.api.publish.PublicationContainer"));
		delegateMap.put("sourceSets", Arrays.asList("org.gradle.api.tasks.SourceSet"));
		delegateMap.put("distributions", Arrays.asList("org.gradle.api.distribution.Distribution"));
		delegateMap.put("fileTree", Arrays.asList("org.gradle.api.file.ConfigurableFileTree"));
		delegateMap.put("copySpec", Arrays.asList("org.gradle.api.file.CopySpec"));
		delegateMap.put("exec", Arrays.asList("org.gradle.process.ExecSpec"));
		delegateMap.put("files", Arrays.asList("org.gradle.api.file.ConfigurableFileCollection"));
		delegateMap.put("task", Arrays.asList("org.gradle.api.Task"));
	}

	public static Map<String, List<String>> getDelegateMap() {
		return delegateMap;
	}

	public static String getDefault() {
		return PROJECT;
	}

	public static String getSettings() {
		return SETTINGS;
	}
}
