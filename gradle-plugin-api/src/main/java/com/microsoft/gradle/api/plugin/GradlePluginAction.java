
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

package com.microsoft.gradle.api.plugin;

import org.gradle.tooling.BuildAction;
import org.gradle.tooling.BuildController;

public class GradlePluginAction implements BuildAction<GradlePluginModel> {
  @Override
  public GradlePluginModel execute(BuildController controller) {
    return controller.getModel(GradlePluginModel.class);
  }
}
