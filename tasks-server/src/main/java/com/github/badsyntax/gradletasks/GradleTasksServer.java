package com.github.badsyntax.gradletasks;

import io.grpc.Server;
import io.grpc.ServerBuilder;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

public class GradleTasksServer {
  private static final Logger logger = Logger.getLogger(GradleTasksServer.class);

  private final int port;
  private final Server server;

  public GradleTasksServer(String pluginPath, int port) {
    this(ServerBuilder.forPort(port), pluginPath, port);
    // See: https://discuss.gradle.org/t/logging-in-gradle-plugin/31685/5
    Logger.setUseQuietLogs(true);
  }

  public GradleTasksServer(ServerBuilder<?> serverBuilder, String pluginPath, int port) {
    this.port = port;
    server = serverBuilder.addService(new GradleTasksService(pluginPath)).build();
  }

  @SuppressWarnings("java:S106")
  public void start() throws IOException {
    server.start();
    logger.info("Server started, listening on {}", port);
    Runtime.getRuntime()
        .addShutdownHook(
            new Thread() {
              @Override
              public void run() {
                logger.error("Shutting down gRPC server since JVM is shutting down");
                try {
                  GradleTasksServer.this.stop();
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
    if (args.length == 0) {
      throw new RuntimeException("pluginPath argument is required");
    }
    String pluginPath = args[0];
    int port = 8887;
    if (args.length > 1) {
      port = Integer.parseInt(args[1]);
    }

    GradleTasksServer server = new GradleTasksServer(pluginPath, port);
    server.start();
    server.blockUntilShutdown();
  }
}
