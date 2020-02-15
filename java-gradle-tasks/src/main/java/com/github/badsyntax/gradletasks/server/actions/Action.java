package com.github.badsyntax.gradletasks.server.actions;

import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import javax.inject.Inject;
import javax.inject.Singleton;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import org.java_websocket.WebSocket;

class Action {
    @Singleton
    protected ExecutorService taskExecutor;

    @Singleton
    protected GradleTaskPool taskPool;

    @Singleton
    protected Logger logger;

    @Inject
    public Action(Logger logger, ExecutorService taskExecutor, GradleTaskPool taskPool) {
        this.logger = logger;
        this.taskExecutor = taskExecutor;
        this.taskPool = taskPool;
    }

    protected void logError(WebSocket connection, String error) {
        logger.warning(error);
        if (connection.isOpen()) {
            connection
                    .send(ServerMessage.Error.newBuilder().setMessage(error).build().toByteArray());
        }
    }
}
