package com.github.badsyntax.gradle;

import io.grpc.Server;
import io.grpc.ServerBuilder;
import java.io.IOException;
import java.util.HashMap;
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
		Map<String, String> params = parseArgs(args);
		int gradleServerPort = Integer.parseInt(params.get("port"));
		String buildServerPipeName = params.get("pipeName");
		String bundleDirectory = params.get("bundleDir");
		String javaExecutablePath = params.getOrDefault("javaExecPath", null);

		GradleServer server = new GradleServer(gradleServerPort);
		Thread gradleServerThread = new Thread(() -> {
			try {
				server.start();
				server.blockUntilShutdown();
			} catch (IOException | InterruptedException e) {
				e.printStackTrace();
			}
		});
		gradleServerThread.start();

		if (javaExecutablePath != null) {
			BuildServerThread buildServerConnectionThread = new BuildServerThread(buildServerPipeName, bundleDirectory,
					javaExecutablePath);
			Thread buildServerThread = new Thread(buildServerConnectionThread);
			buildServerThread.start();
			buildServerThread.join();
		}

		gradleServerThread.join();
	}

	private static Map<String, String> parseArgs(String[] args) {
		Map<String, String> paramMap = new HashMap<>();
		for (String arg : args) {
			if (arg.startsWith("--")) {
				int index = arg.indexOf('=');
				if (index != -1) {
					String key = arg.substring(2, index);
					String value = arg.substring(index + 1);
					paramMap.put(key, value);
				}
			}
		}
		return paramMap;
	}
}
