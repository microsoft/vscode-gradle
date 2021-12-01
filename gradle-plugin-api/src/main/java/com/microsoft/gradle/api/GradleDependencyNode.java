// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.api;

import java.util.List;

public interface GradleDependencyNode {
	String getName();
	GradleDependencyType getType();
	List<GradleDependencyNode> getChildren();
}
