// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import java.io.Serializable;
import java.util.Collections;
import java.util.List;

import com.microsoft.gradle.api.GradleMethod;
import com.microsoft.gradle.api.GradleClosure;

public class DefaultGradleClosure implements GradleClosure, Serializable {
  private String name;
  private List<GradleMethod> methods;
  private List<String> fields;

  public DefaultGradleClosure(String name, List<GradleMethod> methods, List<String> fields) {
    this.name = name;
    this.methods = methods;
    this.fields = fields;
  }

  public DefaultGradleClosure(String name, List<GradleMethod> methods) {
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
