/*******************************************************************************
 * Copyright (c) 2021 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *    Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.gradle.delegate;

import java.util.HashMap;
import java.util.Map;

public class GradleDelegate {
  private static String PROJECT = "org.gradle.api.Project";
  private static String SETTINGS = "org.gradle.api.initialization.Settings";
  private static Map<String, String> delegateMap;

  static {
    delegateMap = new HashMap<>();
    // plugins
    delegateMap.put("application", "org.gradle.api.plugins.ApplicationPluginConvention");
    delegateMap.put("base", "org.gradle.api.plugins.BasePluginConvention");
    delegateMap.put("java", "org.gradle.api.plugins.JavaPluginConvention");
    delegateMap.put("war", "org.gradle.api.plugins.WarPluginConvention");
    // basic closures
    delegateMap.put("plugins", "org.gradle.plugin.use.PluginDependenciesSpec");
    delegateMap.put("configurations", "org.gradle.api.artifacts.Configuration");
    delegateMap.put("dependencySubstitution", "org.gradle.api.artifacts.DependencySubstitutions");
    delegateMap.put("resolutionStrategy", "org.gradle.api.artifacts.ResolutionStrategy");
    delegateMap.put("artifacts", "org.gradle.api.artifacts.dsl.ArtifactHandler");
    delegateMap.put("components", "org.gradle.api.artifacts.dsl.ComponentMetadataHandler");
    delegateMap.put("modules", "org.gradle.api.artifacts.dsl.ComponentModuleMetadataHandler");
    delegateMap.put("dependencies", "org.gradle.api.artifacts.dsl.DependencyHandler");
    delegateMap.put("repositories", "org.gradle.api.artifacts.dsl.RepositoryHandler");
    delegateMap.put("publishing", "org.gradle.api.publish.PublishingExtension");
    delegateMap.put("publications", "org.gradle.api.publish.PublicationContainer");
    delegateMap.put("sourceSets", "org.gradle.api.tasks.SourceSet");
    delegateMap.put("distributions", "org.gradle.api.distribution.Distribution");
    delegateMap.put("fileTree", "org.gradle.api.file.ConfigurableFileTree");
    delegateMap.put("copySpec", "org.gradle.api.file.CopySpec");
    delegateMap.put("exec", "org.gradle.process.ExecSpec");
    delegateMap.put("files", "org.gradle.api.file.ConfigurableFileCollection");
    delegateMap.put("task", "org.gradle.api.Task");
  }

  public static Map<String, String> getDelegateMap() {
    return delegateMap;
  }

  public static String getDefault() {
    return PROJECT;
  }

  public static String getSettings() {
    return SETTINGS;
  }
}
