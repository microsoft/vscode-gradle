// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.api;

public interface GradleTask {
	String getName();
	String getGroup();
	String getPath();
	String getProject();
	String getBuildFile();
	String getRootProject();
	String getDescription();
	boolean getDebuggable();
}
