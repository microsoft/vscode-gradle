package com.github.badsyntax.gradletasks.server;

import java.io.File;
import java.net.InetSocketAddress;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Logger;
import com.eclipsesource.json.JsonObject;
import com.github.badsyntax.gradletasks.server.actions.GetTasksAction;
import com.github.badsyntax.gradletasks.server.actions.RunTaskAction;
import com.github.badsyntax.gradletasks.server.actions.StopGetTasksAction;
import com.github.badsyntax.gradletasks.server.actions.StopTaskAction;
import com.github.badsyntax.gradletasks.server.messages.ClientMessage;
import com.github.badsyntax.gradletasks.server.messages.GenericErrorMessage;
import com.github.badsyntax.gradletasks.server.messages.GenericMessage;
import com.github.badsyntax.gradletasks.server.messages.GradleTasksProgressMessage;
import com.github.badsyntax.gradletasks.server.messages.RunTaskMessage;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public class GradleTasksServer extends WebSocketServer {

    private final ExecutorService taskExecutor = Executors.newCachedThreadPool();
    private Logger logger;
    private Map<String, CancellationTokenSource> runTaskPool =
            new HashMap<String, CancellationTokenSource>();
    private Map<String, CancellationTokenSource> getTasksPool =
            new HashMap<String, CancellationTokenSource>();

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
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        String hostAddress = connection.getRemoteSocketAddress().getAddress().getHostAddress();
        logger.info(String.format("Client connected from %s", hostAddress));
        connection.send(new GenericMessage(String
                .format("Connected to Gradle Tasks server from %s. Welcome client!", hostAddress))
                        .toString());
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {

    }

    @Override
    public void onMessage(WebSocket connection, String message) {
        handleMessageAction(new ClientMessage(message));
    }

    @Override
    public void onMessage(WebSocket connection, ByteBuffer message) {
        handleMessageAction(new ClientMessage(new String(message.array())));
    }

    private void handleMessageAction(ClientMessage clientMessage) {
        JsonObject message = clientMessage.getMessage();
        String messageType = message.get("type").asString();
        switch (messageType) {
            case "runTask":
                runTask(message);
                break;
            case "getTasks":
                getTasks(message);
                break;
            case "stopTask":
                stopTask(message);
                break;
            case "stopGetTasks":
                stopGetTasks(message);
                break;
            default:
                logError(String.format("Unknown action: %s", messageType));
        }
    }

    private void runTask(JsonObject message) {
        GradleTasksServer server = this;
        taskExecutor.submit(new Runnable() {
            public void run() {
                String task = message.get("task").asString();
                String sourceDir = message.get("sourceDir").asString();
                RunTaskAction action =
                        new RunTaskAction(server, new File(sourceDir), task, runTaskPool);
                try {
                    action.run();
                } catch (GradleTasksServerException e) {
                    logError(e.getMessage());
                } finally {
                    broadcast(new RunTaskMessage("Completed runTask action", task).toString());
                }
            }
        });
    }

    private void stopTask(JsonObject message) {
        String task = message.get("task").asString();
        String sourceDir = message.get("sourceDir").asString();
        StopTaskAction action = new StopTaskAction(this, new File(sourceDir), task, runTaskPool);
        try {
            action.run();
        } catch (GradleTasksServerException e) {
            logError(e.getMessage());
        }
        broadcast(new GenericMessage("Completed stopTask action").toString());
    }

    private void stopGetTasks(JsonObject message) {
        String sourceDir = message.get("sourceDir").asString();
        StopGetTasksAction action = new StopGetTasksAction(this, new File(sourceDir), getTasksPool);
        try {
            action.run();
        } catch (GradleTasksServerException e) {
            logError(e.getMessage());
        }
        broadcast(new GenericMessage("Completed stopGetTasks action").toString());
    }

    private void getTasks(JsonObject message) {
        GradleTasksServer server = this;
        taskExecutor.submit(new Runnable() {
            public void run() {
                String sourceDir = message.get("sourceDir").asString();
                broadcast(new GradleTasksProgressMessage("START").toString());
                try {
                    GetTasksAction action = new GetTasksAction(server, new File(sourceDir), getTasksPool);
                    action.run();
                } catch (GradleTasksServerException e) {
                    logError(e.getMessage());
                } finally {
                    broadcast(new GradleTasksProgressMessage("COMPLETE").toString());
                }
            }
        });
    }

    private void logError(String error) {
        broadcast(new GenericErrorMessage(error).toString());
        logger.warning(error);
    }

    @Override
    public void onError(WebSocket connection, Exception e) {
        if (connection != null) {
            logger.warning(e.getMessage());
        }
    }

    @Override
    public void onStart() {
        logger.info("Server started, waiting for clients");
        setConnectionLostTimeout(0);
        setConnectionLostTimeout(100);
    }
}
