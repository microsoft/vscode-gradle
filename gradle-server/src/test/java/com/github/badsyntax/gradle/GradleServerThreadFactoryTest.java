// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.ThreadFactory;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.Test;

/**
 * Verifies that the JSON-RPC worker {@link ThreadFactory} hands out unique,
 * descriptive names so thread dumps and logs can distinguish concurrent
 * handlers — previously every worker shared the literal name
 * {@code "gradle-jsonrpc-worker"}.
 */
public class GradleServerThreadFactoryTest {

	private static final Pattern WORKER_NAME = Pattern.compile("gradle-jsonrpc-worker-(\\d+)");

	@Test
	public void workerFactory_assignsUniqueIncrementingNames() {
		ThreadFactory factory = GradleServer.workerThreadFactory();
		Thread first = factory.newThread(() -> {
		});
		Thread second = factory.newThread(() -> {
		});

		assertNotNull(first.getName());
		assertNotNull(second.getName());
		Matcher m1 = WORKER_NAME.matcher(first.getName());
		Matcher m2 = WORKER_NAME.matcher(second.getName());
		assertTrue("first thread name does not match factory pattern: " + first.getName(), m1.matches());
		assertTrue("second thread name does not match factory pattern: " + second.getName(), m2.matches());
		assertNotEquals("worker thread names must be distinct", first.getName(), second.getName());
		assertEquals(Integer.parseInt(m1.group(1)) + 1, Integer.parseInt(m2.group(1)));
	}

	@Test
	public void workerFactory_marksThreadsAsDaemon() {
		ThreadFactory factory = GradleServer.workerThreadFactory();
		Thread thread = factory.newThread(() -> {
		});
		assertTrue("worker threads must be daemon so they cannot keep the JVM alive", thread.isDaemon());
	}

	@Test
	public void workerFactory_isolatesCounterPerInstance() {
		// Each call to workerThreadFactory() should return a fresh counter so
		// tests (and any future call sites) don't bleed numbering into each other.
		ThreadFactory a = GradleServer.workerThreadFactory();
		ThreadFactory b = GradleServer.workerThreadFactory();
		assertEquals("gradle-jsonrpc-worker-1", a.newThread(() -> {
		}).getName());
		assertEquals("gradle-jsonrpc-worker-1", b.newThread(() -> {
		}).getName());
	}
}
