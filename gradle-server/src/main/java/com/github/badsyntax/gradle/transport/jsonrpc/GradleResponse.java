// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

/**
 * Shared response envelope for every {@code gradle/*} JSON-RPC method.
 *
 * <p>
 * For unary RPCs ({@code executeCommand}, {@code getProjectDependencies},
 * {@code cancelBuild}, {@code cancelBuilds}) {@code reply} carries the
 * base64-encoded protobuf bytes of the single result message.
 *
 * <p>
 * For streaming RPCs ({@code getBuild}, {@code runBuild}) the streamed
 * intermediate messages are delivered on the notification channel; the final
 * response carries the terminal reply (e.g. the {@code GetBuildResult},
 * {@code RunBuildResult} or {@code Cancelled}) so the caller learns the outcome
 * without subscribing to notifications.
 */
public class GradleResponse {
	private String reply;

	public GradleResponse() {
	}

	public GradleResponse(String reply) {
		this.reply = reply;
	}

	public String getReply() {
		return reply;
	}

	public void setReply(String reply) {
		this.reply = reply;
	}
}
