// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.fail;
import static org.junit.Assume.assumeFalse;

import com.github.badsyntax.gradle.CancelBuildsReply;
import java.io.IOException;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.channels.Channels;
import java.nio.channels.ServerSocketChannel;
import java.nio.channels.SocketChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class TaskPipeServerTest {

	private static final long TIMEOUT_MS = 5_000L;

	private ExecutorService taskExecutor;
	private ExecutorService clientExecutor;
	private ExecutorService acceptExecutor;
	private Future<Void> taskListening;
	private Future<Void> clientListening;
	private ServerSocketChannel serverSocket;
	private SocketChannel acceptedChannel;
	private Path socketPath;

	@Before
	public void setUp() throws IOException {
		assumeFalse("Windows named-pipe server creation is covered by VS Code integration tests.", isWindows());

		taskExecutor = Executors.newCachedThreadPool();
		clientExecutor = Executors.newCachedThreadPool();
		acceptExecutor = Executors.newSingleThreadExecutor();
		Path socketDir = Files.createTempDirectory("gradle-task-pipe-test");
		socketPath = socketDir.resolve("task.sock");
		serverSocket = ServerSocketChannel.open(StandardProtocolFamily.UNIX);
		serverSocket.bind(UnixDomainSocketAddress.of(socketPath));
	}

	@After
	public void tearDown() throws IOException {
		if (taskListening != null) {
			taskListening.cancel(true);
		}
		if (clientListening != null) {
			clientListening.cancel(true);
		}
		if (acceptedChannel != null) {
			acceptedChannel.close();
		}
		if (serverSocket != null) {
			serverSocket.close();
		}
		if (taskExecutor != null) {
			taskExecutor.shutdownNow();
		}
		if (clientExecutor != null) {
			clientExecutor.shutdownNow();
		}
		if (acceptExecutor != null) {
			acceptExecutor.shutdownNow();
		}
		if (socketPath != null) {
			Files.deleteIfExists(socketPath);
			Files.deleteIfExists(socketPath.getParent());
		}
	}

	@Test
	public void connectAndStart_connectsOverUnixDomainSocket_andServesJsonRpc() throws Exception {
		Future<SocketChannel> accepted = acceptExecutor.submit(() -> serverSocket.accept());

		taskListening = TaskPipeServer.connectAndStart(socketPath.toString(), taskExecutor);
		acceptedChannel = accepted.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);

		Launcher<GradleService> clientLauncher = new Launcher.Builder<GradleService>()
				.setLocalService(new NoopGradleClient()).setRemoteInterface(GradleService.class)
				.setInput(Channels.newInputStream(acceptedChannel)).setOutput(Channels.newOutputStream(acceptedChannel))
				.setExecutorService(clientExecutor).create();
		clientListening = clientLauncher.startListening();

		GradleResponse response = clientLauncher.getRemoteProxy().cancelBuilds(new GradleRequestParams(null, null))
				.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);
		assertNotNull(response);

		CancelBuildsReply reply = CancelBuildsReply.parseFrom(JsonRpcCodec.decode(response.getReply()));
		assertEquals("Cancel builds requested", reply.getMessage());
	}

	@Test
	public void connectAndStart_reconnectsToSameUnixDomainSocket_afterTransportDisconnect() throws Exception {
		Future<SocketChannel> firstAccepted = acceptExecutor.submit(() -> serverSocket.accept());
		taskListening = TaskPipeServer.connectAndStart(socketPath.toString(), taskExecutor);
		acceptedChannel = firstAccepted.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);

		Launcher<GradleService> firstClientLauncher = createClientLauncher(acceptedChannel);
		clientListening = firstClientLauncher.startListening();
		assertCancelBuilds(firstClientLauncher);

		acceptedChannel.close();
		awaitTransportClosed(taskListening);
		clientListening.cancel(true);
		taskExecutor.shutdownNow();
		taskExecutor = Executors.newCachedThreadPool();

		Future<SocketChannel> secondAccepted = acceptExecutor.submit(() -> serverSocket.accept());
		taskListening = TaskPipeServer.connectAndStart(socketPath.toString(), taskExecutor);
		acceptedChannel = secondAccepted.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);

		Launcher<GradleService> secondClientLauncher = createClientLauncher(acceptedChannel);
		clientListening = secondClientLauncher.startListening();
		assertCancelBuilds(secondClientLauncher);
	}

	private Launcher<GradleService> createClientLauncher(SocketChannel channel) {
		return new Launcher.Builder<GradleService>().setLocalService(new NoopGradleClient())
				.setRemoteInterface(GradleService.class).setInput(Channels.newInputStream(channel))
				.setOutput(Channels.newOutputStream(channel)).setExecutorService(clientExecutor).create();
	}

	private void assertCancelBuilds(Launcher<GradleService> clientLauncher) throws Exception {
		GradleResponse response = clientLauncher.getRemoteProxy().cancelBuilds(new GradleRequestParams(null, null))
				.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);
		assertNotNull(response);

		CancelBuildsReply reply = CancelBuildsReply.parseFrom(JsonRpcCodec.decode(response.getReply()));
		assertEquals("Cancel builds requested", reply.getMessage());
	}

	private void awaitTransportClosed(Future<Void> listening) throws Exception {
		try {
			listening.get(TIMEOUT_MS, TimeUnit.MILLISECONDS);
		} catch (ExecutionException expected) {
			return;
		} catch (TimeoutException e) {
			fail("Expected task transport session to close after disconnect");
		}
	}

	private static boolean isWindows() {
		return System.getProperty("os.name").toLowerCase().contains("win");
	}

	private static final class NoopGradleClient implements GradleClient {
		@Override
		public void onGetBuildReply(GradleStreamPayload params) {
		}

		@Override
		public void onRunBuildReply(GradleStreamPayload params) {
		}
	}
}
