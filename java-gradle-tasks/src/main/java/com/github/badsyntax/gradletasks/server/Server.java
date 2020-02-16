package com.github.badsyntax.gradletasks.server;

import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.util.logging.Logger;
import javax.inject.Inject;
import javax.inject.Singleton;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.actions.ActionRunner;
import com.github.badsyntax.gradletasks.server.actions.exceptions.ActionRunnerException;
import com.google.protobuf.InvalidProtocolBufferException;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public class Server extends WebSocketServer {

    @Singleton
    private Logger logger;

    @Singleton
    private GradleTaskPool taskPool;

    @Singleton
    protected ActionRunner actionRunner;

    @Inject
    public Server(Logger logger, GradleTaskPool taskPool, int port, ActionRunner actionRunner) {
        super(new InetSocketAddress(port));
        this.logger = logger;
        this.taskPool = taskPool;
        this.actionRunner = actionRunner;
    }

    @Override
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        String localHostAddress = connection.getLocalSocketAddress().getAddress().getHostAddress();
        int localPort = connection.getLocalSocketAddress().getPort();
        connection.send(ServerMessage.Message.newBuilder()
                .setInfo(ServerMessage.Info.newBuilder().setMessage(String.format(
                        "Connected to %s:%d. Welcome client!", localHostAddress, localPort)))
                .build().toByteArray());
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        taskPool.getPool().keySet().stream().forEach(
                typeKey -> taskPool.getPool().get(typeKey).keySet().stream().forEach(poolKey -> {
                    CancellationTokenSource cancellationTokenSource =
                            taskPool.getPool().get(typeKey).get(poolKey);
                    cancellationTokenSource.cancel();
                }));
    }

    @Override
    public void onMessage(WebSocket connection, ByteBuffer message) {
        try {
            handleMessageAction(connection, ClientMessage.Message.parseFrom(message));
        } catch (InvalidProtocolBufferException e) {
            logError(connection, e.getMessage());
        }
    }

    private void handleMessageAction(WebSocket connection, ClientMessage.Message clientMessage) {
        try {
            actionRunner.run(connection, clientMessage);
        } catch (ActionRunnerException e) {
            logError(connection, e.getMessage());
        }
    }

    private void logError(WebSocket connection, String errorMessage) {
        connection.send(ServerMessage.Message.newBuilder()
                .setError(ServerMessage.Error.newBuilder().setMessage(errorMessage)).build()
                .toByteArray());
        logger.warning(errorMessage);
    }

    @Override
    public void onError(WebSocket connection, Exception e) {
        if (connection != null && e.getMessage() != null) {
            logError(connection, e.getMessage());
        }
    }

    @Override
    public void onStart() {
        logger.info("Gradle tasks server started");
        setConnectionLostTimeout(0);
        setConnectionLostTimeout(100);
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        throw new UnsupportedOperationException();
    }
}
