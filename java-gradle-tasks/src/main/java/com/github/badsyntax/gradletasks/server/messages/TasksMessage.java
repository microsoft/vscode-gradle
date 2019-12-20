package com.github.badsyntax.gradletasks.server.messages;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;

public class TasksMessage extends GenericMessage {

    JsonArray tasks;
    private static final String TYPE = "GRADLE_TASKS";

    public TasksMessage(String message, JsonArray tasks) {
        super(message);
        this.tasks = tasks;
    }

    public String toString() {
        return Json.object().add("type", TYPE).add("tasks", tasks).toString();
    }
}
