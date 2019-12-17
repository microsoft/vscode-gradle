package com.github.badsyntax.gradletasks.server.messages;

import com.eclipsesource.json.Json;

public class GradleTasksProgressMessage {

    String message;
    private static final String TYPE = "GRADLE_TASKS_PROGRESS";


    public GradleTasksProgressMessage(String message) {
        this.message = message;
    }

    public String toString() {
        return Json.object().add("type", TYPE).add("message", message).toString();
    }
}
