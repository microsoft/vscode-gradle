// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import java.io.Serializable;
import java.util.List;

import com.microsoft.gradle.api.GradleMethod;

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
