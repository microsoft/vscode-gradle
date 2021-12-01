// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.semantictokens;

import java.util.Arrays;
import java.util.List;
import org.eclipse.lsp4j.SemanticTokenModifiers;

public enum TokenModifier {

	DEFAULT_LIBRARY(SemanticTokenModifiers.DefaultLibrary);

	private String genericName;
	// See https://docs.gradle.org/current/javadoc/org/gradle/api/Project.html
	private static List<String> defaultLibrary = Arrays.asList("afterEvaluate", "allprojects", "ant", "apply",
			"artifacts", "beforeEvaluate", "buildscript", "configurations", "configure", "copy", "copySpec",
			"dependencies", "javaexec", "repositories", "subprojects", "task");

	public final int bitmask = 1 << ordinal();

	TokenModifier(String genericName) {
		this.genericName = genericName;
	}

	@Override
	public String toString() {
		return genericName;
	}

	public static boolean isDefaultLibrary(String method) {
		if (TokenModifier.defaultLibrary.contains(method)) {
			return true;
		}
		return false;
	}
}
