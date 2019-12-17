package com.github.badsyntax.gradletasks.server;

import java.io.File;
import java.net.InetSocketAddress;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.util.logging.Logger;

import com.eclipsesource.json.JsonObject;
import com.github.badsyntax.gradletasks.server.actions.GetTasksAction;
import com.github.badsyntax.gradletasks.server.actions.RunTaskAction;
import com.github.badsyntax.gradletasks.server.messages.ClientMessage;
import com.github.badsyntax.gradletasks.server.messages.GenericErrorMessage;
import com.github.badsyntax.gradletasks.server.messages.GradleTasksProgressMessage;
import com.github.badsyntax.gradletasks.server.messages.RunTaskMessage;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public class GradleTasksServer extends WebSocketServer {

    private Logger logger;

    public GradleTasksServer(int port) throws UnknownHostException {
        super(new InetSocketAddress(port));
    }

    public GradleTasksServer(int port, Logger logger) throws UnknownHostException {
        this(port);
        this.logger = logger;
    }

    public GradleTasksServer(InetSocketAddress address) {
        super(address);
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        String hostAddress = conn.getRemoteSocketAddress().getAddress().getHostAddress();
        logger.info(String.format("Client connected from %s", hostAddress));
        conn.send(String.format("Connected to Gradle Tasks server from %s. Welcome client!",
                hostAddress));
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {

    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        handleMessageAction(new ClientMessage(message));
    }

    @Override
    public void onMessage(WebSocket conn, ByteBuffer message) {
        handleMessageAction(new ClientMessage(new String(message.array())));
    }

    private void handleMessageAction(ClientMessage clientMessage) {
        JsonObject message = clientMessage.getMessage();
        String messageType = message.get("type").asString();
        try {
            switch (messageType) {
                case "runTask":
                    runTask(message);
                    break;
                case "getTasks":
                    getTasks(message);
                    break;
                default:
                    String errMessage = String.format("Unknown action: %s", messageType);
                    logger.warning(errMessage);
                    broadcast(new GenericErrorMessage(errMessage).toString());
            }
        } catch (GradleTasksServerException e) {
            broadcast(new GenericErrorMessage(e.getMessage()).toString());
            logger.warning(e.getMessage());
        }
    }

    private void runTask(JsonObject message) throws GradleTasksServerException {
        String task = message.get("task").asString();
        String sourceDir = message.get("sourceDir").asString();
        RunTaskAction action = new RunTaskAction(this, new File(sourceDir), task);
        try {
            action.run();
        } finally {
            broadcast(new RunTaskMessage("Task run successfully", task).toString());
        }
    }

    private void getTasks(JsonObject message) throws GradleTasksServerException {
        String sourceDir = message.get("sourceDir").asString();
        broadcast(new GradleTasksProgressMessage("START").toString());
        try {
            GetTasksAction action = new GetTasksAction(this, new File(sourceDir));
            action.run();
        } finally {
            broadcast(new GradleTasksProgressMessage("COMPLETE").toString());
        }
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        ex.printStackTrace();
        if (conn != null) {
            logger.warning(ex.getMessage());
        }
    }

    @Override
    public void onStart() {
        logger.info("Server started, waiting for clients...");
        setConnectionLostTimeout(0);
        setConnectionLostTimeout(100);
    }

}
