// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.api;

import java.util.List;

public interface GradleMethod {
	String getName();
	List<String> getParameterTypes();
	boolean getDeprecated();
}
