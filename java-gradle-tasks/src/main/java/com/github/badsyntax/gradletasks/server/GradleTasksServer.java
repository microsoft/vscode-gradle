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

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.github.badsyntax.gradletasks.server.actions.GetTasksAction;
import com.github.badsyntax.gradletasks.server.actions.RunTaskAction;
import com.github.badsyntax.gradletasks.server.actions.StopGetTasksAction;
import com.github.badsyntax.gradletasks.server.actions.StopTaskAction;
import com.github.badsyntax.gradletasks.server.messages.ClientMessage;
import com.github.badsyntax.gradletasks.server.messages.GenericErrorMessage;
import com.github.badsyntax.gradletasks.server.messages.GenericMessage;
import com.github.badsyntax.gradletasks.server.messages.RunTaskMessage;
import com.github.badsyntax.gradletasks.server.messages.TasksMessage;

import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public class GradleTasksServer extends WebSocketServer {

    private final ExecutorService taskExecutor = Executors.newCachedThreadPool();
    private Logger logger;
    private Map<String, CancellationTokenSource> runTaskPool = new HashMap<>();
    private Map<String, CancellationTokenSource> getTasksPool = new HashMap<>();
    private static final String MESSAGE_SOURCE_DIR_KEY = "sourceDir";
    private static final String MESSAGE_TYPE_KEY = "type";
    private static final String MESSAGE_TASK_KEY = "task";
    private static final String MESSAGE_TASK_ARGS_KEY = "args";

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
        String remoteHostAddress = connection.getRemoteSocketAddress().getAddress().getHostAddress();
        String localHostAddress = connection.getLocalSocketAddress().getAddress().getHostAddress();
        int localPort = connection.getLocalSocketAddress().getPort();
        connection.send(new GenericMessage(String.format("Connected to %s:%d from %s. Welcome client!",
                localHostAddress, localPort, remoteHostAddress)).toString());
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        // Nothing to cleanup yet
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
        String messageType = message.get(MESSAGE_TYPE_KEY).asString();
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
        String task = message.get(MESSAGE_TASK_KEY).asString();
        String sourceDir = message.get(MESSAGE_SOURCE_DIR_KEY).asString();
        String[] args = message.get(MESSAGE_TASK_ARGS_KEY).asArray().values().stream().map(JsonValue::asString)
                .toArray(String[]::new);
        GradleTasksServer server = this;
        taskExecutor.submit(() -> {
            try {
                RunTaskAction action = new RunTaskAction(server, new File(sourceDir), task, args, runTaskPool);
                action.run();
            } catch (GradleTasksServerException e) {
                logError(e.getMessage());
            } finally {
                broadcast(new RunTaskMessage("Completed runTask action", task).toString());
            }
        });

    }

    private void stopTask(JsonObject message) {
        String task = message.get(MESSAGE_TASK_KEY).asString();
        String sourceDir = message.get(MESSAGE_SOURCE_DIR_KEY).asString();
        StopTaskAction action = new StopTaskAction(this, new File(sourceDir), task, runTaskPool);
        try {
            action.run();
        } catch (GradleTasksServerException e) {
            logError(e.getMessage());
        }
        broadcast(new GenericMessage("Completed stopTask action").toString());
    }

    private void stopGetTasks(JsonObject message) {
        String sourceDir = message.get(MESSAGE_SOURCE_DIR_KEY).asString();
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
        taskExecutor.submit(() -> {
            String sourceDir = message.get(MESSAGE_SOURCE_DIR_KEY).asString();
            JsonArray jsonTasks = Json.array();
            try {
                GetTasksAction action = new GetTasksAction(server, new File(sourceDir), getTasksPool);
                action.run();
                jsonTasks = action.getJsonTasks();
            } catch (GradleTasksServerException e) {
                logError(e.getMessage());
            } finally {
                server.broadcast(new TasksMessage(jsonTasks).toString());
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
