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

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleDependencyType;

public class DefaultGradleDependencyNode implements GradleDependencyNode, Serializable {
  private String name;
  private GradleDependencyType type;
  private List<GradleDependencyNode> children;

  public DefaultGradleDependencyNode(String name, GradleDependencyType type, List<GradleDependencyNode> children) {
    this.name = name;
    this.type = type;
    this.children = children;
  }

  public DefaultGradleDependencyNode(String name, GradleDependencyType type) {
    this.name = name;
    this.type = type;
    this.children = new ArrayList<>();
  }

  public String getName() {
    return this.name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public GradleDependencyType getType() {
    return this.type;
  }

  public void setType(GradleDependencyType type) {
    this.type = type;
  }

  public List<GradleDependencyNode> getChildren() {
    return this.children;
  }

  public void setChildren(List<GradleDependencyNode> children) {
    this.children = children;
  }

  public void addChildren(GradleDependencyNode child) {
    this.children.add(child);
  }
}
