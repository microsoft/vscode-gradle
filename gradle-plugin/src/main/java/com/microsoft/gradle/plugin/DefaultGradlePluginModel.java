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

import com.microsoft.gradle.api.plugin.GradlePluginItem;
import com.microsoft.gradle.api.plugin.GradlePluginModel;

public class DefaultGradlePluginModel implements Serializable, GradlePluginModel {
  private GradlePluginItem pluginItem;

  public DefaultGradlePluginModel(GradlePluginItem pluginItem) {
    this.pluginItem = pluginItem;
  }

  public GradlePluginItem getPluginItem() {
    return this.pluginItem;
  }
}
