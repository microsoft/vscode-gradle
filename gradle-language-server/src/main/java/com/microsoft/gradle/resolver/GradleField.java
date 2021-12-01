// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.resolver;

public class GradleField {
	public String name;
	public boolean deprecated;

	public GradleField(String name, boolean deprecated) {
		this.name = name;
		this.deprecated = deprecated;
	}
}
