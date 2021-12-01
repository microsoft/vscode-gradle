// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.resolver;

public class GradleMethod {
	public String name;
	public String[] parameterTypes;
	public boolean deprecated;

	public GradleMethod(String name, String[] parameterTypes, boolean deprecated) {
		this.name = name;
		this.parameterTypes = parameterTypes;
		this.deprecated = deprecated;
	}
}
