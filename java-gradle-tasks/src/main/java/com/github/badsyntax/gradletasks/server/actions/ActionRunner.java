package com.github.badsyntax.gradletasks.server.actions;

import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import com.eclipsesource.json.JsonObject;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import org.java_websocket.WebSocket;

public class ActionRunner {

    protected WebSocket connection;
    protected JsonObject message;
    protected ExecutorService taskExecutor;
    protected GradleTaskPool taskPool;
    protected Logger logger;

    public ActionRunner(WebSocket connection, JsonObject message, ExecutorService taskExecutor,
            Logger logger, GradleTaskPool taskPool) {
        this.connection = connection;
        this.message = message;
        this.taskExecutor = taskExecutor;
        this.logger = logger;
        this.taskPool = taskPool;
    }

    public void runTask() {
        new RunTaskAction(connection, message, taskExecutor, logger, taskPool).run();
    }

    public void getTasks() {
        new GetTasksAction(connection, message, taskExecutor, logger, taskPool).run();
    }

    public void stopTask() {
        new StopTaskAction(connection, message, taskExecutor, logger, taskPool).run();
    }

    public void stopGetTasks() {
        new StopGetTasksAction(connection, message, taskExecutor, logger, taskPool).run();
    }
}
