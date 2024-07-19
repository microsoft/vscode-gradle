package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.utils.Utils;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleServer {
	private static final Logger logger = LoggerFactory.getLogger(GradleServer.class.getName());

	private final int port;
	private final Server taskServer;

	public GradleServer(int port) {
		this(ServerBuilder.forPort(port), port);
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
		Map<String, String> params = Utils.parseArgs(args);

		int taskServerPort = Integer.parseInt(Utils.validateRequiredParam(params, "port"));
		startTaskServerThread(taskServerPort);

		boolean startBuildServer = Boolean.parseBoolean(Utils.validateRequiredParam(params, "startBuildServer"));
		if (startBuildServer) {
			String buildServerPipeName = Utils.validateRequiredParam(params, "pipeName");
			String bundleDirectory = Utils.validateRequiredParam(params, "bundleDir");
			startBuildServerThread(buildServerPipeName, bundleDirectory);
		}
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
}
