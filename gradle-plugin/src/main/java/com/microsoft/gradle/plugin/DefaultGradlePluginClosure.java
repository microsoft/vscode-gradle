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

import java.io.Serializable;
import java.util.Collections;
import java.util.List;

import com.microsoft.gradle.api.plugin.GradleMethod;
import com.microsoft.gradle.api.plugin.GradlePluginClosure;

public class DefaultGradlePluginClosure implements GradlePluginClosure, Serializable {
  private String name;
  private List<GradleMethod> methods;
  private List<String> fields;

  public DefaultGradlePluginClosure(String name, List<GradleMethod> methods, List<String> fields) {
    this.name = name;
    this.methods = methods;
    this.fields = fields;
  }

  public DefaultGradlePluginClosure(String name, List<GradleMethod> methods) {
    this(name, methods, Collections.emptyList());
  }

  public String getName() {
    return this.name;
  }

  public List<GradleMethod> getMethods() {
    return this.methods;
  }

  public List<String> getFields() {
    return this.fields;
  }
}
