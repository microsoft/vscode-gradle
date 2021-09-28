// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import java.io.Serializable;
import java.util.List;

import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleClosure;
import com.microsoft.gradle.api.GradleProjectModel;

public class DefaultGradleProjectModel implements Serializable, GradleProjectModel {
  private GradleDependencyNode node;
  private List<String> plugins;
  private List<GradleClosure> closures;

  public DefaultGradleProjectModel(GradleDependencyNode node, List<String> plugins,
      List<GradleClosure> closures) {
    this.node = node;
    this.plugins = plugins;
    this.closures = closures;
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
}
