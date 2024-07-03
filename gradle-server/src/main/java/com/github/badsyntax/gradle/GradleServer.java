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
	private final Server server;

	public GradleServer(int port) {
		this(ServerBuilder.forPort(port), port);
	}

	public GradleServer(ServerBuilder<?> serverBuilder, int port) {
		this.port = port;
		server = serverBuilder.addService(new GradleService()).build();
	}

	@SuppressWarnings("java:S106")
	public void start() throws IOException {
		server.start();
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
		if (server != null) {
			server.shutdown().awaitTermination(30, TimeUnit.SECONDS);
		}
	}

	private void blockUntilShutdown() throws InterruptedException {
		if (server != null) {
			server.awaitTermination();
		}
	}

	public static void main(String[] args) throws Exception {
		Map<String, String> params = Utils.parseArgs(args);

		int gradleServerPort = Utils.parseIntegerParam(params, "port");
		String buildServerPipeName = Utils.validateRequiredParam(params, "pipeName");
		String bundleDirectory = Utils.validateRequiredParam(params, "bundleDir");
		// JavaExecutablePath is optional. Null means that the build server will not be
		// started.
		String javaExecutablePath = params.get("javaExecPath");

		startGradleServer(gradleServerPort);
		if (javaExecutablePath != null) {
			startBuildServerThread(buildServerPipeName, bundleDirectory, javaExecutablePath);
		}
	}

	private static void startGradleServer(int port) {
		GradleServer server = new GradleServer(port);
		Thread serverThread = new Thread(() -> {
			try {
				server.start();
				server.blockUntilShutdown();
			} catch (IOException | InterruptedException e) {
				e.printStackTrace();
			}
		});
		serverThread.start();
	}

	private static void startBuildServerThread(String pipeName, String directory, String javaPath)
			throws InterruptedException {
		BuildServerThread buildServerConnectionThread = new BuildServerThread(pipeName, directory, javaPath);
		Thread buildServerThread = new Thread(buildServerConnectionThread);
		buildServerThread.start();
		buildServerThread.join();
	}
}
