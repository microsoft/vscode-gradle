package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import com.eclipsesource.json.JsonObject;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.messages.GenericMessage;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;

public class StopGetTasksAction extends Action {

    public static final String KEY = "stopGetTasks";

    public StopGetTasksAction(WebSocket connection, JsonObject message,
            ExecutorService taskExecutor, Logger logger, GradleTaskPool taskPool) {
        super(connection, message, taskExecutor, logger, taskPool);
    }

    public void run() {
        try {
            File sourceDir = new File(message.get(MESSAGE_SOURCE_DIR_KEY).asString());
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
                getPool.keySet().stream().forEach(keySet -> {
                    CancellationTokenSource cancellationTokenSource = getPool.get(keySet);
                    cancellationTokenSource.cancel();
                    getPool.remove(keySet);
                });
            }
        } catch (ActionException e) {
            logError(e.getMessage());
        } finally {
            if (connection.isOpen()) {
                connection.send(
                        new GenericMessage(String.format("Completed %s action", KEY)).toString());
            }
        }
    }
}
