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
import java.util.List;

import com.microsoft.gradle.api.plugin.GradleMethod;

public class DefaultGradleMethod implements Serializable, GradleMethod {
  private String name;
  private List<String> parameterTypes;

  public DefaultGradleMethod(String name, List<String> parameterTypes) {
    this.name = name;
    this.parameterTypes = parameterTypes;
  }

  public String getName() {
    return this.name;
  }

  public List<String> getParameterTypes() {
    return this.parameterTypes;
  }
}
