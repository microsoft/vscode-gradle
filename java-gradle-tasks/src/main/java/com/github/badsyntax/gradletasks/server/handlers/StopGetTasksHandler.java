package com.github.badsyntax.gradletasks.server.handlers;

import java.io.File;
import java.util.Map;
import java.util.logging.Logger;
import javax.inject.Inject;
import javax.inject.Singleton;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.ConnectionUtil;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.handlers.exceptions.MessageHandlerException;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;

@Singleton
public class StopGetTasksHandler implements MessageHandler {

    @Inject
    protected Logger logger;

    @Inject
    protected GradleTaskPool taskPool;

    @Inject
    public StopGetTasksHandler() {

    }

    private static final String KEY = "ACTION_STOP_GET_TASKS";

    public String getKey(File sourceDir) {
        return KEY + sourceDir.getAbsolutePath();
    }

    @Override
    public void handle(WebSocket connection, ClientMessage.Message clientMessage) {
        try {
            ClientMessage.StopGetTasks message = clientMessage.getStopGetTasks();
            File sourceDir = new File(message.getSourceDir().trim());
            if (!sourceDir.getPath().equals("")) {
                if (sourceDir.getAbsolutePath() != null && !sourceDir.exists()) {
                    throw new MessageHandlerException("Source directory does not exist");
                }
                String key = GetTasksHandler.getKey(sourceDir);
                CancellationTokenSource cancellationTokenSource =
                        taskPool.get(key, GradleTaskPool.TYPE.GET);
                if (cancellationTokenSource != null) {
                    cancellationTokenSource.cancel();
                    taskPool.remove(key, GradleTaskPool.TYPE.GET);
                }
            } else {
                Map<String, CancellationTokenSource> getPool =
                        taskPool.getPoolType(GradleTaskPool.TYPE.GET);
                getPool.keySet().stream().forEach(key -> {
                    CancellationTokenSource cancellationTokenSource = getPool.get(key);
                    cancellationTokenSource.cancel();
                    getPool.remove(key);
                });
            }
        } catch (MessageHandlerException e) {
            logger.warning(e.getMessage());
            ConnectionUtil.sendErrorMessage(connection, e.getMessage());
        } finally {
            if (connection.isOpen()) {
                connection.send(ServerMessage.Message.newBuilder()
                        .setInfo(ServerMessage.Info.newBuilder()
                                .setMessage(String.format("Completed %s", KEY)))
                        .build().toByteArray());
            }
        }
    }
}
