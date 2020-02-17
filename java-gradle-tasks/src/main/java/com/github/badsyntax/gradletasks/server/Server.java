package com.github.badsyntax.gradletasks.server;

import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.util.logging.Logger;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage.Message;
import com.github.badsyntax.gradletasks.server.handlers.exceptions.MessageRouterException;
import com.google.protobuf.InvalidProtocolBufferException;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public class Server extends WebSocketServer {

    @Inject
    protected Logger logger;

    @Inject
    protected GradleTaskPool taskPool;

    @Inject
    protected MessageRouter messageRouter;

    @Inject
    public Server(int port) {
        super(new InetSocketAddress(port));
    }

    @Override
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        String localHostAddress = connection.getLocalSocketAddress().getAddress().getHostAddress();
        int localPort = connection.getLocalSocketAddress().getPort();
        ConnectionUtil.sendInfoMessage(connection,
                String.format("Connected to %s:%d. Welcome client!", localHostAddress, localPort));
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        taskPool.cancelAll();
    }

    @Override
    public void onMessage(WebSocket connection, ByteBuffer message) {
        try {
            Message clientMessage = ClientMessage.Message.parseFrom(message);
            messageRouter.routeToMessageHandler(connection, clientMessage);
        } catch (InvalidProtocolBufferException | MessageRouterException e) {
            logError(connection, e.getMessage());
        }
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

    private void logError(WebSocket connection, String message) {
        logger.warning(message);
        ConnectionUtil.sendErrorMessage(connection, message);
    }
}
