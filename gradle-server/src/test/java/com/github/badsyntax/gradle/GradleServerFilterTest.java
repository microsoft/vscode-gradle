// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import java.util.logging.Filter;
import java.util.logging.Level;
import java.util.logging.LogRecord;
import org.junit.Test;

/**
 * Verifies the narrow filter installed by {@link GradleServer} to suppress the
 * single noisy "Encountered end-of-stream mid-frame" WARNING that grpc-netty
 * emits when the client retries past the known Node.js http2 race
 * (grpc/grpc-node#2872). The filter must match only this exact record and let
 * every other Netty / gRPC warning through.
 */
public class GradleServerFilterTest {

	private static final String MID_FRAME = "INTERNAL: Encountered end-of-stream mid-frame";

	private final Filter filter = GradleServer.buildNettyMidFrameWarningFilter();

	private LogRecord record(String loggerName, Throwable thrown) {
		LogRecord r = new LogRecord(Level.WARNING, "Exception processing message");
		r.setLoggerName(loggerName);
		r.setThrown(thrown);
		return r;
	}

	@Test
	public void suppressesTheKnownNettyMidFrameWarning() {
		LogRecord r = record("io.grpc.netty.NettyServerStream$TransportState",
				new StatusRuntimeException(Status.INTERNAL.withDescription("Encountered end-of-stream mid-frame")));
		assertFalse("the known mid-frame warning must be filtered out", filter.isLoggable(r));
	}

	@Test
	public void suppressesWhenStatusMessageContainsMidFrameWithExtraText() {
		// The full grpc-netty message can vary slightly; we match on substring.
		LogRecord r = record("io.grpc.netty.NettyServerStream",
				new StatusRuntimeException(Status.INTERNAL.withDescription(MID_FRAME + " (size=42)")));
		assertFalse(filter.isLoggable(r));
	}

	@Test
	public void allowsUnrelatedNettyWarnings() {
		LogRecord r = record("io.grpc.netty.NettyServerStream$TransportState",
				new StatusRuntimeException(Status.RESOURCE_EXHAUSTED.withDescription("too many streams")));
		assertTrue("unrelated netty warnings must still surface", filter.isLoggable(r));
	}

	@Test
	public void allowsRecordsFromOtherLoggers() {
		LogRecord r = record("io.netty.handler.codec.http2.Http2ConnectionHandler",
				new StatusRuntimeException(Status.INTERNAL.withDescription(MID_FRAME)));
		assertTrue("the same message from a non-targeted logger must surface", filter.isLoggable(r));
	}

	@Test
	public void allowsRecordsWithDifferentThrowableType() {
		LogRecord r = record("io.grpc.netty.NettyServerStream$TransportState",
				new RuntimeException("Encountered end-of-stream mid-frame"));
		assertTrue("a non-StatusRuntimeException with the same text must surface", filter.isLoggable(r));
	}

	@Test
	public void allowsRecordsWithNoThrowable() {
		LogRecord r = record("io.grpc.netty.NettyServerStream$TransportState", null);
		assertTrue(filter.isLoggable(r));
	}

	@Test
	public void allowsRecordsWithNullLoggerName() {
		LogRecord r = record(null, new StatusRuntimeException(Status.INTERNAL.withDescription(MID_FRAME)));
		assertTrue(filter.isLoggable(r));
	}

	@Test
	public void allowsRecordsWithNullThrowableMessage() {
		LogRecord r = record("io.grpc.netty.NettyServerStream$TransportState",
				new StatusRuntimeException(Status.INTERNAL));
		assertTrue("a StatusRuntimeException without message text must surface", filter.isLoggable(r));
	}
}
