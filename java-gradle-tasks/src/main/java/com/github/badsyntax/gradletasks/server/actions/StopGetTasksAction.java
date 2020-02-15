package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.actions.exceptions.ActionException;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;

public class StopGetTasksAction extends Action {

    @Inject
    public StopGetTasksAction(Logger logger, ExecutorService taskExecutor,
            GradleTaskPool taskPool) {
        super(logger, taskExecutor, taskPool);
    }

    public static final String KEY = "ACTION_STOP_GET_TASKS";

    public void run(WebSocket connection, ClientMessage.StopGetTasks message) {
        try {
            File sourceDir = new File(message.getSourceDir().trim());
            if (!sourceDir.getPath().equals("")) {
                if (sourceDir.getAbsolutePath() != null && !sourceDir.exists()) {
                    throw new ActionException("Source directory does not exist");
                }
                String key = GetTasksAction.getTaskKey(sourceDir);
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
        } catch (ActionException e) {
            logError(connection, e.getMessage());
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
