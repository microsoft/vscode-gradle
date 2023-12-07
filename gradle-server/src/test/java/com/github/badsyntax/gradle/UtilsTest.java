// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle;

import static org.junit.Assert.assertEquals;

import com.github.badsyntax.gradle.utils.Utils;
import io.github.g00fy2.versioncompare.Version;
import java.util.Arrays;
import java.util.Collection;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;
import org.junit.runners.Parameterized.Parameters;

@RunWith(Parameterized.class)
public class UtilsTest {

	private final String gradleVersion;
	private final String javaVersion;
	private final boolean expectedResult;

	public UtilsTest(String gradleVersion, String javaVersion, boolean expectedResult) {
		this.gradleVersion = gradleVersion;
		this.javaVersion = javaVersion;
		this.expectedResult = expectedResult;
	}

	@Parameters
	public static Collection<Object[]> data() {
		return Arrays.asList(new Object[][]{{"8.5", "21", false}, {"8.1", "21", true}, {"8.1", "20.0.2", false},
				{"8.0.1", "20.0.2", true}, {"7.6.0", "19.0.1", false}, {"7.5.0", "19.0.1", true},
				{"7.3.0-rc2", "17.0.1", false}, {"7.2.0", "17.0.1", true}, {"7.2", "16.0.1", false},
				{"6.8.3", "16.0.1", true}, {"7.2", "11.0.11.9-snapshot", false}, {"4.7", "11.0.11.9-snapshot", true},
				{"4.3", "1.8.0_301", false}, {"1.8", "1.8.0_301", true}});
	}

	@Test
	public void testCompatibility() {
		Version gradleVer = new Version(gradleVersion);
		Version javaVer = new Version(javaVersion);
		assertEquals(expectedResult, Utils.hasCompatibilityError(gradleVer, javaVer));
	}
}
