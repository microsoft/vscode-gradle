package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.actions.exceptions.ActionException;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;

public class StopTaskAction extends Action {

    @Inject
    public StopTaskAction(Logger logger, ExecutorService taskExecutor, GradleTaskPool taskPool) {
        super(logger, taskExecutor, taskPool);
    }

    public static final String KEY = "ACTION_STOP_TASK";

    public void run(WebSocket connection, ClientMessage.StopTask message) {
        try {
            File sourceDir = new File(message.getSourceDir().trim());
            if (!sourceDir.exists()) {
                throw new ActionException("Source directory does not exist");
            }
            String key = RunTaskAction.getTaskKey(sourceDir, message.getTask());
            CancellationTokenSource cancellationTokenSource =
                    taskPool.get(key, GradleTaskPool.TYPE.RUN);
            if (cancellationTokenSource != null) {
                cancellationTokenSource.cancel();
                taskPool.remove(key, GradleTaskPool.TYPE.RUN);
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
