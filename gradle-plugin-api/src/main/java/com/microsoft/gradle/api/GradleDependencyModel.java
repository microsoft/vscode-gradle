// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.api;

import org.gradle.tooling.model.Model;

public interface GradleDependencyModel extends Model {
	GradleDependencyNode getDependencyNode();
}
