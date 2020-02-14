package com.github.badsyntax.gradletasks.server;

import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Logger;
import javax.inject.Inject;
import com.eclipsesource.json.JsonObject;
import com.github.badsyntax.gradletasks.server.actions.ActionRunner;
import com.github.badsyntax.gradletasks.server.actions.GetTasksAction;
import com.github.badsyntax.gradletasks.server.actions.RunTaskAction;
import com.github.badsyntax.gradletasks.server.actions.StopGetTasksAction;
import com.github.badsyntax.gradletasks.server.actions.StopTaskAction;
import com.github.badsyntax.gradletasks.server.messages.ClientMessage;
import com.github.badsyntax.gradletasks.server.messages.GenericErrorMessage;
import com.github.badsyntax.gradletasks.server.messages.GenericMessage;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public class Server extends WebSocketServer {

    private final ExecutorService taskExecutor = Executors.newCachedThreadPool();
    private Logger logger;
    private GradleTaskPool taskPool;
    private static final String MESSAGE_TYPE_KEY = "type";

    @Inject
    public Server(Logger logger, GradleTaskPool taskPool, int port) {
        super(new InetSocketAddress(port));
        this.logger = logger;
        this.taskPool = taskPool;
    }

    @Override
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        String localHostAddress = connection.getLocalSocketAddress().getAddress().getHostAddress();
        int localPort = connection.getLocalSocketAddress().getPort();
        connection.send(new GenericMessage(
                String.format("Connected to %s:%d. Welcome client!", localHostAddress, localPort))
                        .toString());
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
    public void onMessage(WebSocket connection, String message) {
        handleMessageAction(connection, new ClientMessage(message));
    }

    @Override
    public void onMessage(WebSocket connection, ByteBuffer message) {
        handleMessageAction(connection, new ClientMessage(new String(message.array())));
    }

    private void handleMessageAction(WebSocket connection, ClientMessage clientMessage) {
        JsonObject message = clientMessage.getMessage();
        String messageType = message.get(MESSAGE_TYPE_KEY).asString();
        ActionRunner actionRunner =
                new ActionRunner(connection, message, taskExecutor, logger, taskPool);
        switch (messageType) {
            case RunTaskAction.KEY:
                actionRunner.runTask();
                break;
            case GetTasksAction.KEY:
                actionRunner.getTasks();
                break;
            case StopTaskAction.KEY:
                actionRunner.stopTask();
                break;
            case StopGetTasksAction.KEY:
                actionRunner.stopGetTasks();
                break;
            default:
                logError(connection, String.format("Unknown action: %s", messageType));
        }
    }

    private void logError(WebSocket connection, String errorMessage) {
        connection.send(new GenericErrorMessage(errorMessage).toString());
        logger.warning(errorMessage);
    }

    @Override
    public void onError(WebSocket connection, Exception e) {
        if (connection != null) {
            logError(connection, e.getMessage());
        }
    }

    @Override
    public void onStart() {
        logger.info("Server started, waiting for clients");
        setConnectionLostTimeout(0);
        setConnectionLostTimeout(100);
    }
}
