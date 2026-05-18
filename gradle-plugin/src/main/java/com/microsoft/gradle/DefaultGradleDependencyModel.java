// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleDependencyModel;
import com.microsoft.gradle.api.GradleDependencyNode;
import java.io.Serializable;

public class DefaultGradleDependencyModel implements GradleDependencyModel, Serializable {
	private GradleDependencyNode node;

	public DefaultGradleDependencyModel(GradleDependencyNode node) {
		this.node = node;
	}

	@Override
	public GradleDependencyNode getDependencyNode() {
		return this.node;
	}
}
