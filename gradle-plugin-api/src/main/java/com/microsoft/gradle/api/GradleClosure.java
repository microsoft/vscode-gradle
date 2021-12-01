// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.api;

import java.util.List;

public interface GradleClosure {
	String getName();
	List<GradleMethod> getMethods();
	List<GradleField> getFields();
}
