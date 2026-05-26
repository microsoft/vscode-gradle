// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;

import org.junit.Test;

public class TaskExceptionTest {

	@Test
	public void threeArgConstructor_preservesTypeMessageAndCause() {
		Throwable cause = new IllegalStateException("root");
		TaskException ex = new TaskException(TaskException.Type.NOT_FOUND, "missing build file", cause);

		assertEquals(TaskException.Type.NOT_FOUND, ex.getType());
		assertEquals("missing build file", ex.getMessage());
		assertSame(cause, ex.getCause());
	}

	@Test
	public void twoArgConstructor_setsNullCause() {
		TaskException ex = new TaskException(TaskException.Type.CANCELLED, "user cancelled");

		assertEquals(TaskException.Type.CANCELLED, ex.getType());
		assertEquals("user cancelled", ex.getMessage());
		assertNull(ex.getCause());
	}
}
