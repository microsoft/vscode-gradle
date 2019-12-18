package com.github.badsyntax.gradletasks.server.messages;

import com.eclipsesource.json.Json;

public class RunTaskMessage extends GenericMessage {

    private String task;
    private static final String TYPE = "GRADLE_RUN_TASK";

    public RunTaskMessage(String message, String task) {
        super(message, TYPE);
        this.task = task;
    }

    @Override
    public String toString() {
        return Json.object().add("type", type).add("message", message).add("task", task).toString();
    }
}
