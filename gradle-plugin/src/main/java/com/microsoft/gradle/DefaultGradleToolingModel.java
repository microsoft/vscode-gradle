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

import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleToolingModel;

public class DefaultGradleToolingModel implements Serializable, GradleToolingModel {
    GradleDependencyNode node;

    public DefaultGradleToolingModel(GradleDependencyNode node) {
        this.node = node;
    }

    public GradleDependencyNode getDependencyNode() {
        return this.node;
    }
}
