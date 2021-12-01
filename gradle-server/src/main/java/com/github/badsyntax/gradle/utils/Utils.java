// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.utils;

import io.github.g00fy2.versioncompare.Version;
import java.io.File;

public class Utils {
	public static boolean isValidFile(File file) {
		return file != null && file.exists();
	}

	public static boolean hasCompatibilityError(Version gradleVersion, Version javaVersion) {
		return !gradleVersion.isAtLeast(getLowestGradleVersion(javaVersion), /* ignoreSuffix */ true);
	}

	private static Version getLowestGradleVersion(Version javaVersion) {
		// Ref: https://docs.gradle.org/current/userguide/compatibility.html
		if (javaVersion.isAtLeast("17")) {
			// See: https://docs.gradle.org/7.3-rc-3/release-notes.html#java17
			return new Version("7.3");
		} else if (javaVersion.isAtLeast("16")) {
			return new Version("7.0");
		} else if (javaVersion.isAtLeast("15")) {
			return new Version("6.7");
		} else if (javaVersion.isAtLeast("14")) {
			return new Version("6.3");
		} else if (javaVersion.isAtLeast("13")) {
			return new Version("6.0");
		} else if (javaVersion.isAtLeast("12")) {
			return new Version("5.4");
		} else if (javaVersion.isAtLeast("11")) {
			return new Version("5.0");
		} else if (javaVersion.isAtLeast("10")) {
			return new Version("4.7");
		} else if (javaVersion.isAtLeast("9")) {
			return new Version("4.3");
		}
		return new Version("2.0");
	}
}
