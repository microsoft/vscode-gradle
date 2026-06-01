// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

/**
 * Shared request envelope for every {@code gradle/*} JSON-RPC method.
 *
 * <p>
 * {@code request} is the base64-encoded protobuf bytes of the original request
 * message (e.g. {@code GetBuildRequest}, {@code RunBuildRequest}). Keeping the
 * wire payload as bytes lets the proto schema stay the single source of truth
 * for field-level semantics.
 *
 * <p>
 * {@code streamId} is only populated for streaming RPCs ({@code getBuild},
 * {@code runBuild}). It is used as a correlation key on the server-to-client
 * notification channel so the TS client can route incoming reply payloads to
 * the right in-flight call. Unary RPCs leave it {@code null}.
 */
public class GradleRequestParams {
	private String request;
	private Long streamId;

	public GradleRequestParams() {
	}

	public GradleRequestParams(String request, Long streamId) {
		this.request = request;
		this.streamId = streamId;
	}

	public String getRequest() {
		return request;
	}

	public void setRequest(String request) {
		this.request = request;
	}

	public Long getStreamId() {
		return streamId;
	}

	public void setStreamId(Long streamId) {
		this.streamId = streamId;
	}
}
