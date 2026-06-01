// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;

/**
 * JSON-RPC client endpoint consumed by {@code gradle-server} to push streamed
 * intermediate messages back to the extension during streaming RPCs.
 *
 * <p>
 * One notification method per streaming RPC keeps demultiplexing on the TS side
 * trivial: the notification carries the full {@code *Reply} protobuf bytes in
 * {@link GradleStreamPayload#getPayload()}, and the TS client switches on
 * {@code reply.getKindCase()} to route progress, output, environment,
 * compatibility-check, cancelled and build-result messages to the existing
 * per-kind handlers. The {@code streamId} correlates the notification with its
 * originating in-flight request.
 *
 * <p>
 * Unary RPCs ({@code getProjectDependencies}, {@code cancelBuild},
 * {@code cancelBuilds}, {@code executeCommand}) do not use this channel — their
 * single response payload flows through the regular JSON-RPC response.
 */
@JsonSegment("gradle")
public interface GradleClient {

	@JsonNotification("getBuild/reply")
	void onGetBuildReply(GradleStreamPayload params);

	@JsonNotification("runBuild/reply")
	void onRunBuildReply(GradleStreamPayload params);
}
