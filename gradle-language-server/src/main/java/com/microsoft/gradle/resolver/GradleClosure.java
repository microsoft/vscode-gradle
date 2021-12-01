// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.resolver;

public class GradleClosure {
	public String name;
	public GradleMethod[] methods;
	public GradleField[] fields;

	public GradleClosure(String name, GradleMethod[] methods, GradleField[] fields) {
		this.name = name;
		this.methods = methods;
		this.fields = fields;
	}
}
