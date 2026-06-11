// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import org.eclipse.lsp4j.jsonrpc.Launcher;

/**
 * Bootstraps the JSON-RPC task transport on the Java side.
 *
 * <p>
 * The extension (Node) listens first on {@code 127.0.0.1:0} and spawns the
 * Gradle server JVM with the chosen ephemeral port. This class is the
 * counterpart on the JVM side: it opens a {@link Socket} back to the
 * extension's listener, wires an LSP4J {@link Launcher} around the resulting
 * input/output streams, and returns the {@link Future} that resolves when the
 * launcher stops listening (typically because the extension closed the socket
 * on shutdown).
 *
 * <p>
 * A 30-second connect timeout guards against the extension crashing before the
 * JVM finished starting; the JVM will then exit instead of hanging.
 */
public final class TaskSocketServer {

	private static final int CONNECT_TIMEOUT_MS = 30_000;
	private static final String LOOPBACK = "127.0.0.1";

	private TaskSocketServer() {
	}

	/**
	 * Open the loopback socket, build the JSON-RPC launcher, and start listening.
	 *
	 * @param port
	 *            the ephemeral port the extension is listening on
	 * @param workerExecutor
	 *            executor used by {@link GradleServiceImpl} to run handlers; the
	 *            caller is responsible for shutting it down once the returned
	 *            {@link Future} completes.
	 * @return a {@link Future} that resolves when the JSON-RPC channel closes;
	 *         block on it from a dedicated thread to keep the JVM alive
	 */
	public static Future<Void> connectAndStart(int port, ExecutorService workerExecutor) throws IOException {
		Socket socket = new Socket();
		socket.connect(new InetSocketAddress(LOOPBACK, port), CONNECT_TIMEOUT_MS);
		// Mirror the Node listener: disable Nagle for the small JSON-RPC frames
		// and enable TCP keepalive so a half-open connection (peer gone without
		// a FIN, e.g. a security product severing loopback) is detected instead
		// of blocking forever on a read.
		socket.setTcpNoDelay(true);
		socket.setKeepAlive(true);

		GradleServiceImpl service = new GradleServiceImpl(workerExecutor);
		Launcher<GradleClient> launcher = new Launcher.Builder<GradleClient>().setLocalService(service)
				.setRemoteInterface(GradleClient.class).setInput(socket.getInputStream())
				.setOutput(socket.getOutputStream()).setExecutorService(workerExecutor).create();
		service.setClient(launcher.getRemoteProxy());

		Future<Void> listening = launcher.startListening();
		closeSocketWhenDone(listening, socket);
		return listening;
	}

	private static void closeSocketWhenDone(Future<Void> listening, Socket socket) {
		Thread closer = new Thread(() -> {
			try {
				listening.get();
			} catch (Exception ignored) {
				// fall through to close the socket regardless of how listening ended
			} finally {
				try {
					socket.close();
				} catch (IOException ignored) {
					// best-effort cleanup; nothing to do if the socket is already torn down
				}
			}
		}, "gradle-jsonrpc-socket-closer");
		closer.setDaemon(true);
		closer.start();
	}
}
