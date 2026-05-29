// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

import com.github.badsyntax.gradle.CancelBuildRequest;
import com.github.badsyntax.gradle.ExecuteCommandRequest;
import com.github.badsyntax.gradle.GetBuildRequest;
import com.github.badsyntax.gradle.GetProjectDependenciesRequest;
import com.github.badsyntax.gradle.RunBuildRequest;
import com.github.badsyntax.gradle.handlers.CancelBuildHandler;
import com.github.badsyntax.gradle.handlers.CancelBuildsHandler;
import com.github.badsyntax.gradle.handlers.ExecuteCommandHandler;
import com.github.badsyntax.gradle.handlers.GetBuildHandler;
import com.github.badsyntax.gradle.handlers.GetProjectDependenciesHandler;
import com.github.badsyntax.gradle.handlers.RunBuildHandler;
import com.google.protobuf.InvalidProtocolBufferException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException;

/**
 * {@link GradleService} implementation that decodes the base64 request envelope
 * into the matching protobuf message, dispatches the work onto a dedicated
 * worker executor (so the LSP4J IO thread is never blocked by Gradle Tooling
 * API calls), and lets each handler complete the returned
 * {@link CompletableFuture} directly.
 *
 * <p>
 * Streaming RPCs ({@code getBuild}, {@code runBuild}) receive the
 * {@link GradleClient} proxy and the caller-provided {@code streamId} so
 * intermediate replies can be pushed back as
 * {@link GradleClient#onGetBuildReply(GradleStreamPayload) onXxxReply}
 * notifications. The terminal reply (build result, cancelled, or empty)
 * resolves the response future.
 *
 * <p>
 * The {@link GradleClient} proxy is wired in via
 * {@link #setClient(GradleClient)} after the launcher is built — the launcher
 * creates the proxy from this service's instance, which means construction
 * precedes proxy availability.
 */
public class GradleServiceImpl implements GradleService {

	private final ExecutorService executor;
	private volatile GradleClient client;

	public GradleServiceImpl(ExecutorService executor) {
		this.executor = executor;
	}

	public void setClient(GradleClient client) {
		this.client = client;
	}

	@Override
	public CompletableFuture<GradleResponse> getBuild(GradleRequestParams params) {
		ResponseErrorException paramError = validateParams(params);
		if (paramError != null) {
			return failed(paramError);
		}
		Long streamId = params.getStreamId();
		if (streamId == null) {
			return failed(JsonRpcCodec.error(JsonRpcCodec.ERROR_UNKNOWN, "streamId is required for gradle/getBuild"));
		}
		return dispatch(params, GetBuildRequest::parseFrom,
				(req, future) -> new GetBuildHandler(req, future, client, streamId).run());
	}

	@Override
	public CompletableFuture<GradleResponse> runBuild(GradleRequestParams params) {
		ResponseErrorException paramError = validateParams(params);
		if (paramError != null) {
			return failed(paramError);
		}
		Long streamId = params.getStreamId();
		if (streamId == null) {
			return failed(JsonRpcCodec.error(JsonRpcCodec.ERROR_UNKNOWN, "streamId is required for gradle/runBuild"));
		}
		return dispatch(params, RunBuildRequest::parseFrom,
				(req, future) -> new RunBuildHandler(req, future, client, streamId).run());
	}

	@Override
	public CompletableFuture<GradleResponse> getProjectDependencies(GradleRequestParams params) {
		ResponseErrorException paramError = validateParams(params);
		if (paramError != null) {
			return failed(paramError);
		}
		return dispatch(params, GetProjectDependenciesRequest::parseFrom,
				(req, future) -> new GetProjectDependenciesHandler(req, future).run());
	}

	@Override
	public CompletableFuture<GradleResponse> cancelBuild(GradleRequestParams params) {
		ResponseErrorException paramError = validateParams(params);
		if (paramError != null) {
			return failed(paramError);
		}
		return dispatch(params, CancelBuildRequest::parseFrom,
				(req, future) -> new CancelBuildHandler(req, future).run());
	}

	@Override
	public CompletableFuture<GradleResponse> cancelBuilds(GradleRequestParams params) {
		// `cancelBuilds` carries no request payload; the only validation is that
		// `params` itself is not null (lsp4j passes null when the client sends an
		// empty params object or omits the field).
		if (params == null) {
			return failed(JsonRpcCodec.error(JsonRpcCodec.ERROR_UNKNOWN, "params is required"));
		}
		CompletableFuture<GradleResponse> future = new CompletableFuture<>();
		executor.submit(() -> {
			try {
				new CancelBuildsHandler(future).run();
			} catch (Throwable t) {
				completeWithInternal(future, t);
			}
		});
		return future;
	}

	@Override
	public CompletableFuture<GradleResponse> executeCommand(GradleRequestParams params) {
		ResponseErrorException paramError = validateParams(params);
		if (paramError != null) {
			return failed(paramError);
		}
		return dispatch(params, ExecuteCommandRequest::parseFrom,
				(req, future) -> new ExecuteCommandHandler(req, future).run());
	}

	private static ResponseErrorException validateParams(GradleRequestParams params) {
		if (params == null) {
			return JsonRpcCodec.error(JsonRpcCodec.ERROR_UNKNOWN, "params is required");
		}
		if (params.getRequest() == null) {
			return JsonRpcCodec.error(JsonRpcCodec.ERROR_UNKNOWN, "params.request is required");
		}
		return null;
	}

	private <T> CompletableFuture<GradleResponse> dispatch(GradleRequestParams params, ProtoParser<T> parser,
			HandlerInvoker<T> invoker) {
		CompletableFuture<GradleResponse> future = new CompletableFuture<>();
		executor.submit(() -> {
			T req;
			try {
				req = parser.parse(JsonRpcCodec.decode(params.getRequest()));
			} catch (InvalidProtocolBufferException e) {
				future.completeExceptionally(JsonRpcCodec.error(JsonRpcCodec.ERROR_UNKNOWN, e));
				return;
			} catch (IllegalArgumentException e) {
				// Base64 decode failure — caller sent a malformed payload.
				future.completeExceptionally(JsonRpcCodec.error(JsonRpcCodec.ERROR_UNKNOWN,
						"params.request is not valid base64: " + e.getMessage()));
				return;
			} catch (Throwable t) {
				completeWithInternal(future, t);
				return;
			}
			try {
				invoker.invoke(req, future);
			} catch (Throwable t) {
				completeWithInternal(future, t);
			}
		});
		return future;
	}

	private static void completeWithInternal(CompletableFuture<GradleResponse> future, Throwable t) {
		if (!future.isDone()) {
			future.completeExceptionally(JsonRpcCodec.error(JsonRpcCodec.ERROR_INTERNAL, t));
		}
	}

	private static CompletableFuture<GradleResponse> failed(Throwable t) {
		CompletableFuture<GradleResponse> future = new CompletableFuture<>();
		future.completeExceptionally(t);
		return future;
	}

	@FunctionalInterface
	private interface ProtoParser<T> {
		T parse(byte[] bytes) throws InvalidProtocolBufferException;
	}

	@FunctionalInterface
	private interface HandlerInvoker<T> {
		void invoke(T request, CompletableFuture<GradleResponse> future);
	}
}
