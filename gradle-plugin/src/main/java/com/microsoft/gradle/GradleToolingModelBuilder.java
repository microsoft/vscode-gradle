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

package com.microsoft.gradle;

import java.util.Set;

import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleDependencyType;
import com.microsoft.gradle.api.GradleToolingModel;

import org.gradle.api.Project;
import org.gradle.api.artifacts.Configuration;
import org.gradle.api.artifacts.ConfigurationContainer;
import org.gradle.api.artifacts.ResolvableDependencies;
import org.gradle.api.artifacts.result.DependencyResult;
import org.gradle.api.artifacts.result.ResolutionResult;
import org.gradle.api.artifacts.result.ResolvedComponentResult;
import org.gradle.api.artifacts.result.ResolvedDependencyResult;
import org.gradle.tooling.provider.model.ToolingModelBuilder;

public class GradleToolingModelBuilder implements ToolingModelBuilder {
  public boolean canBuild(String modelName) {
    return modelName.equals(GradleToolingModel.class.getName());
  }

  public Object buildAll(String modelName, Project project) {
    GradleDependencyNode node = generateDefaultGradleDependencyNode(project);
    return new DefaultGradleToolingModel(node);
  }

  private GradleDependencyNode generateDefaultGradleDependencyNode(Project project) {
    DefaultGradleDependencyNode rootNode = new DefaultGradleDependencyNode(project.getName(),
        GradleDependencyType.PROJECT);
    ConfigurationContainer configurationContainer = project.getConfigurations();
    for (String configName : configurationContainer.getNames()) {
      Configuration config = configurationContainer.getByName(configName);
      if (!config.isCanBeResolved()) {
        continue;
      }
      DefaultGradleDependencyNode configNode = new DefaultGradleDependencyNode(config.getName(),
          GradleDependencyType.CONFIGURATION);
      ResolvableDependencies incoming = config.getIncoming();
      ResolutionResult resolutionResult = incoming.getResolutionResult();
      ResolvedComponentResult rootResult = resolutionResult.getRoot();
      Set<? extends DependencyResult> dependencies = rootResult.getDependencies();
      for (DependencyResult dependency : dependencies) {
        if (dependency instanceof ResolvedDependencyResult) {
          DefaultGradleDependencyNode dependencyNode = resolveDependency((ResolvedDependencyResult) dependency);
          configNode.addChildren(dependencyNode);
        }
      }
      if (!configNode.getChildren().isEmpty()) {
        rootNode.addChildren(configNode);
      }
    }
    return rootNode;
  }

  private DefaultGradleDependencyNode resolveDependency(ResolvedDependencyResult result) {
    DefaultGradleDependencyNode dependencyNode = new DefaultGradleDependencyNode(
        result.getSelected().getModuleVersion().getGroup() + ":" + result.getSelected().getModuleVersion().getName()
            + ":" + result.getSelected().getModuleVersion().getVersion(),
        GradleDependencyType.DEPENDENCY);
    Set<? extends DependencyResult> dependencies = result.getSelected().getDependencies();
    for (DependencyResult dependency : dependencies) {
      if (dependency instanceof ResolvedDependencyResult) {
        DefaultGradleDependencyNode childNode = resolveDependency((ResolvedDependencyResult) dependency);
        dependencyNode.addChildren(childNode);
      }
    }
    return dependencyNode;
  }
}
