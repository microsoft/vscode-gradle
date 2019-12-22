package com.github.badsyntax.gradletasks.server.messages;

import com.eclipsesource.json.Json;

public class ActionCancelledMessage extends GenericMessage {

    private static final String TYPE = "ACTION_CANCELLED";
    private String task;
    private String sourceDir;

    public ActionCancelledMessage(String message, String task, String sourceDir) {
        super(message, TYPE);
        this.task = task;
        this.sourceDir = sourceDir;
    }

    @Override
    public String toString() {
        return Json.object().add("type", type).add("message", message).add("task", task)
                .add("sourceDir", sourceDir).toString();
    }

}
