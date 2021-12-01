// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleExecutionException;

public interface GradleExecution {
	public String exec(String... args) throws GradleExecutionException;
}
