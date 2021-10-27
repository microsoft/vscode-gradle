// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import java.io.Serializable;

import com.microsoft.gradle.api.GradleField;

public class DefaultGradleField implements Serializable, GradleField {
  private String name;
  private boolean deprecated;

  public DefaultGradleField(String name, boolean deprecated) {
    this.name = name;
    this.deprecated = deprecated;
  }

  public String getName() {
    return this.name;
  }

  public boolean getDeprecated() {
    return this.deprecated;
  }
}
