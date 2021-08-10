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

package com.microsoft.gradle.api;

import java.io.Serializable;
import org.gradle.tooling.BuildAction;
import org.gradle.tooling.BuildController;

public class GradleModelAction implements Serializable, BuildAction {
  @Override
  public GradleToolingModel execute(BuildController controller) {
    return controller.getModel(GradleToolingModel.class);
  }
}
