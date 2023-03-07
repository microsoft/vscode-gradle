// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.github.badsyntax.gradle.utils.Utils;
import io.github.g00fy2.versioncompare.Version;
import org.junit.Test;

public class UtilsTest {

	@Test
	public void testJava19Compatibility() {
		Version javaVersion = new Version("19.0.1");
		Version gradleVersion = new Version("7.6.0");
		assertFalse(Utils.hasCompatibilityError(gradleVersion, javaVersion));
		gradleVersion = new Version("7.5.0");
		assertTrue(Utils.hasCompatibilityError(gradleVersion, javaVersion));
	}

	@Test
	public void testJava17Compatibility() {
		Version javaVersion = new Version("17.0.1");
		Version gradleVersion = new Version("7.3.0-rc2");
		assertFalse(Utils.hasCompatibilityError(gradleVersion, javaVersion));
		gradleVersion = new Version("7.2.0");
		assertTrue(Utils.hasCompatibilityError(gradleVersion, javaVersion));
	}

	@Test
	public void testJava16Compatibility() {
		Version javaVersion = new Version("16.0.1");
		Version gradleVersion = new Version("7.2");
		assertFalse(Utils.hasCompatibilityError(gradleVersion, javaVersion));
		gradleVersion = new Version("6.8.3");
		assertTrue(Utils.hasCompatibilityError(gradleVersion, javaVersion));
	}

	@Test
	public void testJava11Compatibility() {
		Version javaVersion = new Version("11.0.11.9-snapshot");
		Version gradleVersion = new Version("7.2");
		assertFalse(Utils.hasCompatibilityError(gradleVersion, javaVersion));
		gradleVersion = new Version("4.7");
		assertTrue(Utils.hasCompatibilityError(gradleVersion, javaVersion));
	}

	@Test
	public void testJava8Compatibility() {
		Version javaVersion = new Version("1.8.0_301");
		Version gradleVersion = new Version("4.3");
		assertFalse(Utils.hasCompatibilityError(gradleVersion, javaVersion));
		gradleVersion = new Version("1.8");
		assertTrue(Utils.hasCompatibilityError(gradleVersion, javaVersion));
	}
}
