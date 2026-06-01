// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

/**
 * Server-to-client notification payload for streaming RPCs.
 *
 * <p>
 * {@code streamId} matches the value the TS client sent on the originating
 * request so it can demultiplex notifications back to the right in-flight call.
 * {@code payload} is the base64-encoded protobuf bytes of the streamed
 * {@code GetBuildReply} / {@code RunBuildReply} message. The TS client inspects
 * the {@code kindCase()} of the decoded reply to dispatch to the existing
 * per-kind handlers (progress, output, environment, compatibility, cancelled,
 * build-result).
 */
public class GradleStreamPayload {
	private long streamId;
	private String payload;

	public GradleStreamPayload() {
	}

	public GradleStreamPayload(long streamId, String payload) {
		this.streamId = streamId;
		this.payload = payload;
	}

	public long getStreamId() {
		return streamId;
	}

	public void setStreamId(long streamId) {
		this.streamId = streamId;
	}

	public String getPayload() {
		return payload;
	}

	public void setPayload(String payload) {
		this.payload = payload;
	}
}
