package com.github.badsyntax.gradletasks.server.actions;

import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import com.eclipsesource.json.JsonObject;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.listeners.GradleOutputListener;
import com.github.badsyntax.gradletasks.server.listeners.GradleProgressListener;
import com.github.badsyntax.gradletasks.server.messages.GenericErrorMessage;
import org.java_websocket.WebSocket;

abstract class Action {

    protected static final String MESSAGE_SOURCE_DIR_KEY = "sourceDir";
    protected static final String MESSAGE_TYPE_KEY = "type";
    protected static final String MESSAGE_TASK_KEY = "task";
    protected static final String MESSAGE_TASK_ARGS_KEY = "args";

    protected WebSocket connection;
    protected JsonObject message;
    protected ExecutorService taskExecutor;
    protected GradleTaskPool taskPool;
    protected Logger logger;
    protected GradleProgressListener progressListener;
    protected GradleOutputListener stdOutListener;
    protected GradleOutputListener stdErrListener;

    public Action(WebSocket connection, JsonObject message, ExecutorService taskExecutor, Logger logger, GradleTaskPool taskPool) {
        this.connection = connection;
        this.message = message;
        this.taskExecutor = taskExecutor;
        this.logger = logger;
        this.taskPool = taskPool;
        this.progressListener = new GradleProgressListener(connection);
        this.stdOutListener = new GradleOutputListener(connection, GradleOutputListener.TYPES.STDOUT);
        this.stdErrListener = new GradleOutputListener(connection, GradleOutputListener.TYPES.STDERR);
    }

    public GradleProgressListener getProgressListener() {
        return progressListener;
    }

    public GradleOutputListener getStdOutListener() {
        return stdOutListener;
    }

    public GradleOutputListener getStdErrListener() {
        return stdErrListener;
    }

    protected void logError(String error) {
        if (connection.isOpen()) {
            connection.send(new GenericErrorMessage(error).toString());
        }
        logger.warning(error);
    }
}
