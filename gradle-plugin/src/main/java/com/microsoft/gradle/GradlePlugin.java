// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import org.gradle.api.Project;
import org.gradle.tooling.provider.model.ToolingModelBuilderRegistry;

import javax.inject.Inject;

import org.gradle.api.Plugin;

public class GradlePlugin implements Plugin<Project> {

  private ToolingModelBuilderRegistry registry;

  @Inject
  public GradlePlugin(ToolingModelBuilderRegistry registry) {
    this.registry = registry;
  }

  @Override
  public void apply(Project project) {
    registry.register(new GradleProjectModelBuilder());
  }
}
