package com.github.badsyntax.gradletasks;

import java.io.IOException;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

import io.grpc.Server;
import io.grpc.ServerBuilder;

public class GradleTasksServer {
  private static final Logger logger = Logger.getLogger(GradleTasksServer.class.getName());

  private final int port;
  private final Server server;

  public GradleTasksServer(int port) throws IOException {
    this(ServerBuilder.forPort(port), port);
  }

  public GradleTasksServer(ServerBuilder<?> serverBuilder, int port) {
    this.port = port;
    server = serverBuilder.addService(new GradleTasksService()).build();
  }

  public void start() throws IOException {
    server.start();
    logger.info(String.format("Server started, listening on %d", port));
    Runtime.getRuntime().addShutdownHook(new Thread() {
      @Override
      public void run() {
        System.err.println("*** shutting down gRPC server since JVM is shutting down");
        try {
          GradleTasksServer.this.stop();
        } catch (InterruptedException e) {
          e.printStackTrace(System.err);
        }
        System.err.println("*** server shut down");
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
    GradleTasksServer server = new GradleTasksServer(port);
    server.start();
    server.blockUntilShutdown();
  }
}
