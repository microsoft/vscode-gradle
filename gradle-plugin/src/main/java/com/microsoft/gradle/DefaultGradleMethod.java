// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleMethod;
import java.io.Serializable;
import java.util.List;

public class DefaultGradleMethod implements Serializable, GradleMethod {
	private String name;
	private List<String> parameterTypes;
	private boolean deprecated;

	public DefaultGradleMethod(String name, List<String> parameterTypes, boolean deprecated) {
		this.name = name;
		this.parameterTypes = parameterTypes;
		this.deprecated = deprecated;
	}

	public String getName() {
		return this.name;
	}

	public List<String> getParameterTypes() {
		return this.parameterTypes;
	}

	public boolean getDeprecated() {
		return this.deprecated;
	}
}
