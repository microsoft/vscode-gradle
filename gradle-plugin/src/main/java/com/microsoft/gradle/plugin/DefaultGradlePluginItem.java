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

import com.microsoft.gradle.api.plugin.GradlePluginClosure;
import com.microsoft.gradle.api.plugin.GradlePluginItem;

public class DefaultGradlePluginItem implements GradlePluginItem, Serializable {
  private List<String> plugins;
  private List<GradlePluginClosure> closures;

  public DefaultGradlePluginItem(List<String> plugins, List<GradlePluginClosure> closures) {
    this.plugins = plugins;
    this.closures = closures;
  }

  public List<String> getPlugins() {
    return this.plugins;
  }

  public List<GradlePluginClosure> getClosures() {
    return this.closures;
  }
}
