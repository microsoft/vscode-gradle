package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import com.eclipsesource.json.JsonObject;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.messages.GenericMessage;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;

public class StopTaskAction extends Action {

    public static final String KEY = "stopTask";

    public StopTaskAction(WebSocket connection, JsonObject message, ExecutorService taskExecutor,
            Logger logger, GradleTaskPool taskPool) {
        super(connection, message, taskExecutor, logger, taskPool);
    }

    public void run() {
        try {
            String task = message.get(MESSAGE_TASK_KEY).asString();
            File sourceDir = new File(message.get(MESSAGE_SOURCE_DIR_KEY).asString());
            if (!sourceDir.exists()) {
                throw new ActionException("Source directory does not exist");
            }
            String key = RunTaskAction.getTaskKey(sourceDir, task);
            CancellationTokenSource cancellationTokenSource = taskPool.get(key, GradleTaskPool.TYPE.RUN);
            if (cancellationTokenSource != null) {
                cancellationTokenSource.cancel();
                taskPool.remove(key, GradleTaskPool.TYPE.RUN);
            }
        } catch (ActionException e) {
            logError(e.getMessage());
        } finally {
            if (connection.isOpen()) {
                connection
                        .send(new GenericMessage(String.format("Completed %s action", KEY)).toString());
            }
        }
    }
}
