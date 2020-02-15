package com.github.badsyntax.gradletasks.server.actions;

import javax.inject.Inject;
import javax.inject.Singleton;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.server.actions.exceptions.ActionRunnerException;
import org.java_websocket.WebSocket;

public class ActionRunner {

    @Singleton
    private RunTaskAction runTaskAction;

    @Singleton
    private GetTasksAction getTasksAction;

    @Singleton
    private StopTaskAction stopTaskAction;

    @Singleton
    private StopGetTasksAction stopGetTasksAction;

    @Inject
    public ActionRunner(RunTaskAction runTaskAction, GetTasksAction getTasksAction, StopTaskAction stopTaskAction, StopGetTasksAction stopGetTasksAction) {
        this.runTaskAction = runTaskAction;
        this.getTasksAction = getTasksAction;
        this.stopTaskAction = stopTaskAction;
        this.stopGetTasksAction = stopGetTasksAction;
    }

    public void run(WebSocket connection, ClientMessage.Message message) throws ActionRunnerException {
        if (message.hasGetTasks()){
            getTasksAction.run(connection, message.getGetTasks());
        } else if (message.hasRunTask()) {
            runTaskAction.run(connection, message.getRunTask());
        } else if (message.hasStopTask()) {
            stopTaskAction.run(connection, message.getStopTask());
        } else if (message.hasStopGetTasks()) {
            stopGetTasksAction.run(connection, message.getStopGetTasks());
        } else {
            throw new ActionRunnerException("Unknown client message");
        }
    }
}
