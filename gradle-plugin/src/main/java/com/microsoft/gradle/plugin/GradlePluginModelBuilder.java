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

package com.microsoft.gradle.plugin;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import com.microsoft.gradle.api.plugin.GradleMethod;
import com.microsoft.gradle.api.plugin.GradlePluginClosure;
import com.microsoft.gradle.api.plugin.GradlePluginItem;
import com.microsoft.gradle.api.plugin.GradlePluginModel;

import org.gradle.api.Project;
import org.gradle.api.plugins.Convention;
import org.gradle.api.plugins.ExtensionsSchema;
import org.gradle.api.plugins.ExtensionsSchema.ExtensionSchema;
import org.gradle.api.reflect.TypeOf;
import org.gradle.tooling.provider.model.ToolingModelBuilder;

public class GradlePluginModelBuilder implements ToolingModelBuilder {
  public boolean canBuild(String modelName) {
    return modelName.equals(GradlePluginModel.class.getName());
  }

  public Object buildAll(String modelName, Project project) {
    GradlePluginItem pluginItem = getGradlePluginItem(project);
    return new DefaultGradlePluginModel(pluginItem);
  }

  private GradlePluginItem getGradlePluginItem(Project project) {
    Convention convention = project.getConvention();
    ExtensionsSchema extensionsSchema = convention.getExtensionsSchema();
    List<GradlePluginClosure> closures = new ArrayList<>();
    for (ExtensionSchema schema : extensionsSchema.getElements()) {
      TypeOf<?> publicType = schema.getPublicType();
      Class<?> concreteClass = publicType.getConcreteClass();
      List<GradleMethod> methods = new ArrayList<>();
      for (Method method : concreteClass.getMethods()) {
        List<String> parameterTypes = new ArrayList<>();
        for (Class<?> parameterType : method.getParameterTypes()) {
          parameterTypes.add(parameterType.getName());
        }
        methods.add(new DefaultGradleMethod(method.getName(), parameterTypes));
      }
      List<String> fields = new ArrayList<>();
      for (Field field : concreteClass.getFields()) {
        fields.add(field.getName());
      }
      DefaultGradlePluginClosure closure = new DefaultGradlePluginClosure(schema.getName(), methods, fields);
      closures.add(closure);
    }
    List<String> pluginNames = new ArrayList<>(convention.getPlugins().keySet());
    return new DefaultGradlePluginItem(pluginNames, closures);
  }
}
