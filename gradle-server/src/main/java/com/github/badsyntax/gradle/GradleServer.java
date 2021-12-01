package com.github.badsyntax.gradle;

import io.grpc.Server;
import io.grpc.ServerBuilder;
import java.io.IOException;
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
		logger.info("Server started, listening on {}", port);
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
		int port = 8887;
		if (args.length > 0) {
			port = Integer.parseInt(args[0]);
		}
		GradleServer server = new GradleServer(port);
		server.start();
		server.blockUntilShutdown();
	}
}
