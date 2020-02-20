package com.github.badsyntax.gradletasks.server;

import java.io.IOException;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;
import javax.inject.Inject;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import io.grpc.stub.StreamObserver;

public class GradleTasksServer {
    private Server server;

    @Inject
    protected Logger logger;

    @Inject
    int port;

    @Inject
    public GradleTasksServer() {
    }

    public void start() throws IOException, InterruptedException {
        server = ServerBuilder.forPort(port).addService(new GradleTasksServiceImpl()).build()
                .start();
        logger.info("Server started, listening on " + port);
        Runtime.getRuntime().addShutdownHook(new Thread() {
            @Override
            public void run() {
                // Use stderr here since the logger may have been reset by its JVM shutdown hook.
                System.err.println("Shutting down gRPC server since JVM is shutting down...");
                try {
                    GradleTasksServer.this.stop();
                } catch (InterruptedException e) {
                    e.printStackTrace(System.err);
                }
                System.err.println("Server shut down");
            }
        });
        blockUntilShutdown();
    }

    private void stop() throws InterruptedException {
        if (server != null) {
            server.shutdown().awaitTermination(30, TimeUnit.SECONDS);
        }
    }

    /**
     * Await termination on the main thread since the grpc library uses daemon threads.
     */
    private void blockUntilShutdown() throws InterruptedException {
        if (server != null) {
            server.awaitTermination();
        }
    }
}
