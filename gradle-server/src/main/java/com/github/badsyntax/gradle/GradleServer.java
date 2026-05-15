package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.utils.Utils;
import com.google.common.base.Strings;
import com.microsoft.gradle.GradleLanguageServer;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import io.grpc.StatusRuntimeException;
import io.grpc.netty.NettyServerBuilder;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.logging.Filter;
import java.util.logging.Handler;
import java.util.logging.Level;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleServer {
	private static final Logger logger = LoggerFactory.getLogger(GradleServer.class.getName());

	private final int port;
	private final Server taskServer;

	public GradleServer(int port) {
		this(NettyServerBuilder.forAddress(new InetSocketAddress("127.0.0.1", port)), port);
	}

	public GradleServer(ServerBuilder<?> serverBuilder, int port) {
		this.port = port;
		taskServer = serverBuilder.addService(new TaskService()).build();
	}

	@SuppressWarnings("java:S106")
	public void start() throws IOException {
		taskServer.start();
		logger.info("Gradle Server started, listening on {}", port);
		Runtime.getRuntime().addShutdownHook(new Thread() {
			@Override
			public void run() {
				logger.info("Shutting down gRPC server since JVM is shutting down");
				try {
					GradleServer.this.stop();
				} catch (InterruptedException e) {
					e.printStackTrace(System.err);
					Thread.currentThread().interrupt();
				}
				logger.info("Server shut down");
			}
		});
	}

	public void stop() throws InterruptedException {
		if (taskServer != null) {
			taskServer.shutdown().awaitTermination(30, TimeUnit.SECONDS);
		}
	}

	private void blockUntilShutdown() throws InterruptedException {
		if (taskServer != null) {
			taskServer.awaitTermination();
		}
	}

	public static void main(String[] args) throws Exception {
		installNettyMidFrameWarningFilter();

		Map<String, String> params = Utils.parseArgs(args);

		int taskServerPort = Integer.parseInt(Utils.validateRequiredParam(params, "port"));
		startTaskServerThread(taskServerPort);

		String languageServerPipePath = params.get("languageServerPipePath");
		if (!Strings.isNullOrEmpty(languageServerPipePath)) {
			startLanguageServerThread(languageServerPipePath);
		}

		boolean startBuildServer = Boolean.parseBoolean(Utils.validateRequiredParam(params, "startBuildServer"));
		if (startBuildServer) {
			String buildServerPipeName = Utils.validateRequiredParam(params, "pipeName");
			String bundleDirectory = Utils.validateRequiredParam(params, "bundleDir");
			startBuildServerThread(buildServerPipeName, bundleDirectory);
		}
	}

	/**
	 * The client retries once on the known Node.js http2 race that produces a
	 * truncated DATA + END_STREAM frame when reusing an HTTP/2 session (tracked
	 * upstream as grpc/grpc-node#2872; maintainers attribute the root cause to Node
	 * and recommend application-level retry). When this happens, grpc-netty logs an
	 * INTERNAL "Encountered end-of-stream mid-frame" WARNING with a long stack
	 * trace to stderr, which surfaces in the extension output channel as a scary
	 * error even though the retried call succeeded. Filter that single record out
	 * of every JUL handler attached to the root logger; the filter checks the log
	 * level, the logger name, the throwable type and the message text, so all other
	 * Netty warnings (TLS, protocol violations, etc.) and any record at a different
	 * level (e.g. SEVERE) pass through unchanged. If a handler already had a filter
	 * configured, the existing filter is preserved and chained so we never silently
	 * bypass other logging policies.
	 */
	private static void installNettyMidFrameWarningFilter() {
		Filter suppression = buildNettyMidFrameWarningFilter();
		java.util.logging.Logger root = java.util.logging.Logger.getLogger("");
		for (Handler h : root.getHandlers()) {
			Filter previous = h.getFilter();
			h.setFilter(composeFilters(previous, suppression));
		}
	}

	// Package-private for testing.
	static Filter buildNettyMidFrameWarningFilter() {
		return record -> {
			if (!Level.WARNING.equals(record.getLevel())) {
				return true;
			}
			Throwable t = record.getThrown();
			String name = record.getLoggerName();
			return !(name != null && name.startsWith("io.grpc.netty.NettyServerStream")
					&& t instanceof StatusRuntimeException && t.getMessage() != null
					&& t.getMessage().contains("Encountered end-of-stream mid-frame"));
		};
	}

	// Package-private for testing.
	static Filter composeFilters(Filter previous, Filter next) {
		if (previous == null) {
			return next;
		}
		return record -> previous.isLoggable(record) && next.isLoggable(record);
	}

	private static void startTaskServerThread(int port) {
		GradleServer server = new GradleServer(port);
		Thread serverThread = new Thread(() -> {
			try {
				server.start();
				server.blockUntilShutdown();
			} catch (IOException | InterruptedException e) {
				throw new RuntimeException(e);
			}
		});
		serverThread.start();
	}

	private static void startBuildServerThread(String pipeName, String directory) {
		BuildServerThread buildServerConnectionThread = new BuildServerThread(pipeName, directory);
		Thread buildServerThread = new Thread(buildServerConnectionThread);
		buildServerThread.start();
	}

	private static void startLanguageServerThread(String languageServerPipePath) {
		Thread languageServerThread = new Thread(() -> {
			GradleLanguageServer.main(new String[]{languageServerPipePath});
		});
		languageServerThread.start();
	}
}
