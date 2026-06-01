// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

import java.util.concurrent.CompletableFuture;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;

/**
 * JSON-RPC server endpoint exposed by {@code gradle-server} over a TCP loopback
 * {@code MessageConnection}.
 *
 * <p>
 * Each method maps 1:1 to a former RPC on the legacy {@code Gradle} transport.
 * Streaming RPCs ({@code getBuild}, {@code runBuild}) deliver intermediate
 * messages out-of-band on the {@link GradleClient} notification channel and
 * resolve their {@link CompletableFuture} when the stream terminates. Unary
 * RPCs resolve directly with the single response payload.
 *
 * <p>
 * <b>Ordering invariant for streaming RPCs:</b> a handler MUST enqueue every
 * intermediate {@link GradleClient} notification for a given {@code streamId}
 * before it completes the response {@link CompletableFuture}. LSP4J serialises
 * all outbound traffic on a single {@code RemoteEndpoint}, so honouring this
 * call order guarantees the client receives all streamed progress/output before
 * the terminal reply — reproducing the in-order delivery the old single
 * server-streaming call provided. See {@code RunBuildHandler#notify} /
 * {@code GetBuildHandler#notify} and the ordering test in
 * {@code GradleServerTest}.
 *
 * <p>
 * The wire envelope ({@link GradleRequestParams} / {@link GradleResponse})
 * carries base64-encoded protobuf bytes so the proto schema continues to be the
 * single source of truth for field-level semantics.
 */
@JsonSegment("gradle")
public interface GradleService {

	@JsonRequest
	CompletableFuture<GradleResponse> getBuild(GradleRequestParams params);

	@JsonRequest
	CompletableFuture<GradleResponse> runBuild(GradleRequestParams params);

	@JsonRequest
	CompletableFuture<GradleResponse> getProjectDependencies(GradleRequestParams params);

	@JsonRequest
	CompletableFuture<GradleResponse> cancelBuild(GradleRequestParams params);

	@JsonRequest
	CompletableFuture<GradleResponse> cancelBuilds(GradleRequestParams params);

	@JsonRequest
	CompletableFuture<GradleResponse> executeCommand(GradleRequestParams params);
}
