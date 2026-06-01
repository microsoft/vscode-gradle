// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.github.badsyntax.gradle.GetBuildRequest;
import com.github.badsyntax.gradle.GradleConfig;
import com.github.badsyntax.gradle.RunBuildRequest;
import java.io.IOException;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException;
import org.eclipse.lsp4j.jsonrpc.messages.ResponseError;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * End-to-end tests for the JSON-RPC transport package. The tests wire two LSP4J
 * {@link Launcher} instances together over a pair of piped streams so that the
 * full request/response/notification path is exercised — encoding, dispatch,
 * executor handoff, error mapping and proxy-driven notifications — without
 * spinning up a real socket and without depending on the Gradle Tooling API.
 */
public class JsonRpcTransportTest {

	private static final long TIMEOUT_MS = 5_000L;
	private static final int PIPE_BUFFER = 64 * 1024;

	private ExecutorService serverExecutor;
	private ExecutorService clientExecutor;
	private Future<Void> serverListening;
	private Future<Void> clientListening;
	private PipedOutputStream clientToServerOut;
	private PipedOutputStream serverToClientOut;
	private RecordingClient recordingClient;
	private StubService stubService;
	private GradleService serviceProxy;

	@Before
	public void setUp() throws IOException {
		serverExecutor = Executors.newCachedThreadPool();
		clientExecutor = Executors.newCachedThreadPool();

		PipedInputStream clientToServerIn = new PipedInputStream(PIPE_BUFFER);
		clientToServerOut = new PipedOutputStream(clientToServerIn);
		PipedInputStream serverToClientIn = new PipedInputStream(PIPE_BUFFER);
		serverToClientOut = new PipedOutputStream(serverToClientIn);

		stubService = new StubService();
		Launcher<GradleClient> serverLauncher = new Launcher.Builder<GradleClient>().setLocalService(stubService)
				.setRemoteInterface(GradleClient.class).setInput(clientToServerIn).setOutput(serverToClientOut)
				.setExecutorService(serverExecutor).create();
		stubService.setClient(serverLauncher.getRemoteProxy());

		recordingClient = new RecordingClient();
		Launcher<GradleService> clientLauncher = new Launcher.Builder<GradleService>().setLocalService(recordingClient)
				.setRemoteInterface(GradleService.class).setInput(serverToClientIn).setOutput(clientToServerOut)
				.setExecutorService(clientExecutor).create();
		serviceProxy = clientLauncher.getRemoteProxy();

		serverListening = serverLauncher.startListening();
		clientListening = clientLauncher.startListening();
	}

	@After
	public void tearDown() throws IOException {
		clientToServerOut.close();
		serverToClientOut.close();
		serverListening.cancel(true);
		clientListening.cancel(true);
		serverExecutor.shutdownNow();
		clientExecutor.shutdownNow();
	}

	@Test
	public void codec_encodeDecode_proto_roundtrip() {
		GetBuildRequest original = GetBuildRequest.newBuilder().setProjectDir("/tmp/proj")
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		String encoded = JsonRpcCodec.encode(original);
		byte[] decoded = JsonRpcCodec.decode(encoded);

		assertArrayEquals(original.toByteArray(), decoded);
	}

	@Test
	public void getBuild_request_carriesBase64ProtoBytes_roundtrip() throws Exception {
		GetBuildRequest request = GetBuildRequest.newBuilder().setProjectDir("/tmp/proj")
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();
		String responsePayload = "response-bytes";
		stubService.nextResponse = new GradleResponse(responsePayload);

		GradleResponse reply = await(serviceProxy.getBuild(new GradleRequestParams(JsonRpcCodec.encode(request), 7L)));

		assertEquals(1, stubService.getBuildCalls.size());
		GradleRequestParams seen = stubService.getBuildCalls.peek();
		assertArrayEquals(request.toByteArray(), JsonRpcCodec.decode(seen.getRequest()));
		assertEquals(Long.valueOf(7L), seen.getStreamId());
		assertEquals(responsePayload, reply.getReply());
	}

	@Test
	public void getBuild_streamingNotifications_deliveredBeforeTerminalResponse() throws Exception {
		stubService.notifyDuringGetBuild = true;
		stubService.nextResponse = new GradleResponse("terminal");

		GradleResponse reply = await(serviceProxy.getBuild(new GradleRequestParams("req", 11L)));

		assertEquals("terminal", reply.getReply());

		long deadline = System.currentTimeMillis() + TIMEOUT_MS;
		while (recordingClient.getBuildNotifications.size() < 2 && System.currentTimeMillis() < deadline) {
			Thread.sleep(10);
		}
		assertEquals(2, recordingClient.getBuildNotifications.size());
		List<GradleStreamPayload> payloads = new ArrayList<>(recordingClient.getBuildNotifications);
		assertEquals(11L, payloads.get(0).getStreamId());
		assertEquals("progress-1", payloads.get(0).getPayload());
		assertEquals("progress-2", payloads.get(1).getPayload());
	}

	@Test
	public void getBuild_missingStreamId_rejectedBeforeDispatch() throws Exception {
		GradleServiceImpl service = new GradleServiceImpl(serverExecutor);
		GetBuildRequest request = GetBuildRequest.newBuilder().setProjectDir("/tmp/proj")
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		assertResponseError(service.getBuild(new GradleRequestParams(JsonRpcCodec.encode(request), null)),
				JsonRpcCodec.ERROR_UNKNOWN, "streamId is required");
	}

	@Test
	public void runBuild_request_roundtrip() throws Exception {
		RunBuildRequest request = RunBuildRequest.newBuilder().setProjectDir("/tmp/proj").addArgs("build").build();
		stubService.nextResponse = new GradleResponse("ok");

		GradleResponse reply = await(serviceProxy.runBuild(new GradleRequestParams(JsonRpcCodec.encode(request), 3L)));

		assertEquals(1, stubService.runBuildCalls.size());
		assertArrayEquals(request.toByteArray(), JsonRpcCodec.decode(stubService.runBuildCalls.peek().getRequest()));
		assertEquals("ok", reply.getReply());
	}

	@Test
	public void runBuild_streamingNotifications_useRunBuildChannel() throws Exception {
		stubService.notifyDuringRunBuild = true;
		stubService.nextResponse = new GradleResponse("done");

		await(serviceProxy.runBuild(new GradleRequestParams("req", 22L)));

		long deadline = System.currentTimeMillis() + TIMEOUT_MS;
		while (recordingClient.runBuildNotifications.size() < 1 && System.currentTimeMillis() < deadline) {
			Thread.sleep(10);
		}
		assertEquals(1, recordingClient.runBuildNotifications.size());
		assertEquals(22L, recordingClient.runBuildNotifications.peek().getStreamId());
		assertEquals(0, recordingClient.getBuildNotifications.size());
	}

	@Test
	public void runBuild_missingStreamId_rejectedBeforeDispatch() throws Exception {
		GradleServiceImpl service = new GradleServiceImpl(serverExecutor);
		RunBuildRequest request = RunBuildRequest.newBuilder().setProjectDir("/tmp/proj").addArgs("build").build();

		assertResponseError(service.runBuild(new GradleRequestParams(JsonRpcCodec.encode(request), null)),
				JsonRpcCodec.ERROR_UNKNOWN, "streamId is required");
	}

	@Test
	public void getBuild_nullParams_rejectedAsUnknown() throws Exception {
		// JSON-RPC clients can omit `params` or send `null`; lsp4j hands a null
		// reference straight to the handler. The dispatcher must classify that
		// as a client input error rather than INTERNAL.
		GradleServiceImpl service = new GradleServiceImpl(serverExecutor);
		assertResponseError(service.getBuild(null), JsonRpcCodec.ERROR_UNKNOWN, "params is required");
	}

	@Test
	public void getBuild_nullRequestPayload_rejectedAsUnknown() throws Exception {
		GradleServiceImpl service = new GradleServiceImpl(serverExecutor);
		assertResponseError(service.getBuild(new GradleRequestParams(null, 1L)), JsonRpcCodec.ERROR_UNKNOWN,
				"params.request is required");
	}

	@Test
	public void getBuild_invalidBase64Payload_rejectedAsUnknown() throws Exception {
		// Base64 decode failures used to fall through to the catch-all `Throwable`
		// branch and surface as INTERNAL (-32603). Now they should be reported as
		// a client input error (-32000 UNKNOWN).
		GradleServiceImpl service = new GradleServiceImpl(serverExecutor);
		assertResponseError(service.getBuild(new GradleRequestParams("!!!not-base64!!!", 1L)),
				JsonRpcCodec.ERROR_UNKNOWN, "not valid base64");
	}

	@Test
	public void cancelBuilds_nullParams_rejectedAsUnknown() throws Exception {
		GradleServiceImpl service = new GradleServiceImpl(serverExecutor);
		assertResponseError(service.cancelBuilds(null), JsonRpcCodec.ERROR_UNKNOWN, "params is required");
	}

	@Test
	public void getProjectDependencies_unary_roundtrip() throws Exception {
		stubService.nextResponse = new GradleResponse("deps");
		GradleResponse reply = await(serviceProxy.getProjectDependencies(new GradleRequestParams("req", null)));
		assertEquals(1, stubService.getProjectDependenciesCalls.size());
		assertEquals("deps", reply.getReply());
	}

	@Test
	public void cancelBuild_unary_roundtrip() throws Exception {
		stubService.nextResponse = new GradleResponse("cancelled-ack");
		GradleResponse reply = await(serviceProxy.cancelBuild(new GradleRequestParams("req", null)));
		assertEquals(1, stubService.cancelBuildCalls.size());
		assertEquals("cancelled-ack", reply.getReply());
	}

	@Test
	public void cancelBuilds_unary_roundtrip() throws Exception {
		stubService.nextResponse = new GradleResponse(null);
		GradleResponse reply = await(serviceProxy.cancelBuilds(new GradleRequestParams(null, null)));
		assertEquals(1, stubService.cancelBuildsCalls.size());
		assertNull(reply.getReply());
	}

	@Test
	public void executeCommand_unary_roundtrip() throws Exception {
		stubService.nextResponse = new GradleResponse("cmd-out");
		GradleResponse reply = await(serviceProxy.executeCommand(new GradleRequestParams("req", null)));
		assertEquals(1, stubService.executeCommandCalls.size());
		assertEquals("cmd-out", reply.getReply());
	}

	@Test
	public void error_notFound_mappedAcrossWire() throws Exception {
		stubService.nextError = JsonRpcCodec.error(JsonRpcCodec.ERROR_NOT_FOUND, "missing project");
		assertResponseError(serviceProxy.getProjectDependencies(new GradleRequestParams("req", null)),
				JsonRpcCodec.ERROR_NOT_FOUND, "missing project");
	}

	@Test
	public void error_cancelled_mappedAcrossWire() throws Exception {
		stubService.nextError = JsonRpcCodec.error(JsonRpcCodec.ERROR_CANCELLED, "build cancelled");
		assertResponseError(serviceProxy.getProjectDependencies(new GradleRequestParams("req", null)),
				JsonRpcCodec.ERROR_CANCELLED, "build cancelled");
	}

	@Test
	public void error_internal_fromThrowable_carriesMessageAcrossWire() throws Exception {
		stubService.nextError = JsonRpcCodec.error(JsonRpcCodec.ERROR_INTERNAL,
				new IllegalStateException("boom in handler"));
		assertResponseError(serviceProxy.getBuild(new GradleRequestParams("req", 1L)), JsonRpcCodec.ERROR_INTERNAL,
				"boom in handler");
	}

	@Test
	public void errorCodes_matchWireContract() {
		// Codes are part of the wire contract with the TS client; pinning them here
		// catches accidental renumbering before it ships.
		assertEquals(-32000, JsonRpcCodec.ERROR_UNKNOWN);
		assertEquals(-32001, JsonRpcCodec.ERROR_NOT_FOUND);
		assertEquals(-32002, JsonRpcCodec.ERROR_CANCELLED);
		assertEquals(-32603, JsonRpcCodec.ERROR_INTERNAL);
	}

	private static void assertResponseError(CompletableFuture<GradleResponse> future, int expectedCode,
			String expectedMessageContains) throws InterruptedException, TimeoutException {
		try {
			future.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);
			fail("Expected ResponseErrorException, but future completed successfully");
		} catch (ExecutionException expected) {
			Throwable cause = expected.getCause();
			assertNotNull("ExecutionException had no cause", cause);
			assertTrue("Expected ResponseErrorException, got " + cause.getClass().getName(),
					cause instanceof ResponseErrorException);
			ResponseError error = ((ResponseErrorException) cause).getResponseError();
			assertEquals(expectedCode, error.getCode());
			assertTrue("Expected error message to contain '" + expectedMessageContains + "' but was '"
					+ error.getMessage() + "'", error.getMessage().contains(expectedMessageContains));
		}
	}

	private static <T> T await(CompletableFuture<T> future) throws Exception {
		return future.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);
	}

	/**
	 * Server-side stub: records every incoming RPC and replays a queued response.
	 */
	private static final class StubService implements GradleService {
		final ConcurrentLinkedQueue<GradleRequestParams> getBuildCalls = new ConcurrentLinkedQueue<>();
		final ConcurrentLinkedQueue<GradleRequestParams> runBuildCalls = new ConcurrentLinkedQueue<>();
		final ConcurrentLinkedQueue<GradleRequestParams> getProjectDependenciesCalls = new ConcurrentLinkedQueue<>();
		final ConcurrentLinkedQueue<GradleRequestParams> cancelBuildCalls = new ConcurrentLinkedQueue<>();
		final ConcurrentLinkedQueue<GradleRequestParams> cancelBuildsCalls = new ConcurrentLinkedQueue<>();
		final ConcurrentLinkedQueue<GradleRequestParams> executeCommandCalls = new ConcurrentLinkedQueue<>();

		volatile GradleResponse nextResponse;
		volatile ResponseErrorException nextError;
		volatile boolean notifyDuringGetBuild;
		volatile boolean notifyDuringRunBuild;
		private volatile GradleClient client;

		void setClient(GradleClient client) {
			this.client = client;
		}

		@Override
		public CompletableFuture<GradleResponse> getBuild(GradleRequestParams params) {
			getBuildCalls.add(params);
			if (notifyDuringGetBuild) {
				client.onGetBuildReply(new GradleStreamPayload(params.getStreamId(), "progress-1"));
				client.onGetBuildReply(new GradleStreamPayload(params.getStreamId(), "progress-2"));
			}
			return reply();
		}

		@Override
		public CompletableFuture<GradleResponse> runBuild(GradleRequestParams params) {
			runBuildCalls.add(params);
			if (notifyDuringRunBuild) {
				client.onRunBuildReply(new GradleStreamPayload(params.getStreamId(), "run-progress"));
			}
			return reply();
		}

		@Override
		public CompletableFuture<GradleResponse> getProjectDependencies(GradleRequestParams params) {
			getProjectDependenciesCalls.add(params);
			return reply();
		}

		@Override
		public CompletableFuture<GradleResponse> cancelBuild(GradleRequestParams params) {
			cancelBuildCalls.add(params);
			return reply();
		}

		@Override
		public CompletableFuture<GradleResponse> cancelBuilds(GradleRequestParams params) {
			cancelBuildsCalls.add(params);
			return reply();
		}

		@Override
		public CompletableFuture<GradleResponse> executeCommand(GradleRequestParams params) {
			executeCommandCalls.add(params);
			return reply();
		}

		private CompletableFuture<GradleResponse> reply() {
			if (nextError != null) {
				CompletableFuture<GradleResponse> failed = new CompletableFuture<>();
				failed.completeExceptionally(nextError);
				return failed;
			}
			return CompletableFuture.completedFuture(nextResponse);
		}
	}

	/**
	 * Client-side recording proxy backend: every notification is captured for
	 * assertion.
	 */
	private static final class RecordingClient implements GradleClient {
		final ConcurrentLinkedQueue<GradleStreamPayload> getBuildNotifications = new ConcurrentLinkedQueue<>();
		final ConcurrentLinkedQueue<GradleStreamPayload> runBuildNotifications = new ConcurrentLinkedQueue<>();

		@Override
		public void onGetBuildReply(GradleStreamPayload params) {
			getBuildNotifications.add(params);
		}

		@Override
		public void onRunBuildReply(GradleStreamPayload params) {
			runBuildNotifications.add(params);
		}
	}
}
