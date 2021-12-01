// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import java.nio.file.Path;
import java.nio.file.Paths;

public class GradleTestConstants {
	public static String LANGUAGE_GRADLE = "gradle";
	public static String TEST_PROJECT_PATH = "./test-resources/spring-boot-webapp";
	public static Path testPath = Paths.get(System.getProperty("user.dir"))
			.resolve(GradleTestConstants.TEST_PROJECT_PATH);;
}
