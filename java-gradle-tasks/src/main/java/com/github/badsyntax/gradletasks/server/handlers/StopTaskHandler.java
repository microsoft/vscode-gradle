package com.github.badsyntax.gradletasks.server.handlers;

import java.io.File;
import java.util.logging.Logger;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.ConnectionUtil;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.handlers.exceptions.MessageHandlerException;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.WebSocket;

public class StopTaskHandler implements MessageHandler {

    @Inject
    protected Logger logger;

    @Inject
    protected GradleTaskPool taskPool;

    @Inject
    public StopTaskHandler() {

    }

    private static final String KEY = "ACTION_STOP_TASK";

    @Override
    public void handle(WebSocket connection, ClientMessage.Message clientMessage) {
        try {
            ClientMessage.StopTask message = clientMessage.getStopTask();
            File sourceDir = new File(message.getSourceDir().trim());
            if (!sourceDir.exists()) {
                throw new MessageHandlerException("Source directory does not exist");
            }
            String key = RunTaskHandler.getTaskKey(sourceDir, message.getTask());
            CancellationTokenSource cancellationTokenSource =
                    taskPool.get(key, GradleTaskPool.TYPE.RUN);
            if (cancellationTokenSource != null) {
                cancellationTokenSource.cancel();
                taskPool.remove(key, GradleTaskPool.TYPE.RUN);
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
