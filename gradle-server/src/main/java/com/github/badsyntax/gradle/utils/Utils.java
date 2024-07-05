// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.utils;

import io.github.g00fy2.versioncompare.Version;
import java.io.File;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class Utils {
	public static boolean isValidFile(File file) {
		return file != null && file.exists();
	}

	public static boolean hasCompatibilityError(Version gradleVersion, Version javaVersion) {
		return !gradleVersion.isAtLeast(getLowestGradleVersion(javaVersion), /* ignoreSuffix */ true);
	}

	private static Version getLowestGradleVersion(Version javaVersion) {
		// Ref: https://docs.gradle.org/current/userguide/compatibility.html
		if (javaVersion.isAtLeast("21")) {
			return new Version("8.5");
		} else if (javaVersion.isAtLeast("20")) {
			return new Version("8.1");
		} else if (javaVersion.isAtLeast("19")) {
			return new Version("7.6");
		} else if (javaVersion.isAtLeast("18")) {
			return new Version("7.5");
		} else if (javaVersion.isAtLeast("17")) {
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

	public static String normalizePackageName(String name) {
		return Utils.toPackageName(name).toLowerCase(Locale.US);
	}

	private static String toPackageName(String name) {
		StringBuilder result = new StringBuilder();
		int pos = 0;
		while (pos < name.length()) {
			while (pos < name.length() && !Character.isJavaIdentifierStart(name.charAt(pos))) {
				pos++;
			}
			if (pos == name.length()) {
				break;
			}
			if (result.length() != 0) {
				result.append('.');
			}
			result.append(name.charAt(pos));
			pos++;
			while (pos < name.length() && Character.isJavaIdentifierPart(name.charAt(pos))) {
				result.append(name.charAt(pos));
				pos++;
			}
		}
		return result.toString();
	}
	public static Map<String, String> parseArgs(String[] args) {
		Map<String, String> paramMap = new HashMap<>();
		for (String arg : args) {
			if (arg.startsWith("--")) {
				int index = arg.indexOf('=');
				if (index != -1) {
					String key = arg.substring(2, index);
					String value = arg.substring(index + 1);
					paramMap.put(key, value);
				}
			}
		}
		return paramMap;
	}

	public static String validateRequiredParam(Map<String, String> params, String key) throws IllegalArgumentException {
		String value = params.get(key);
		if (value == null || value.isEmpty()) {
			throw new IllegalArgumentException(key + " is required and can not be empty");
		}
		return value;
	}
}
