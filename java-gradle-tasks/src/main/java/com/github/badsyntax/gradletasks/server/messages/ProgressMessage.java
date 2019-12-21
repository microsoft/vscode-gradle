package com.github.badsyntax.gradletasks.server.messages;

import com.eclipsesource.json.Json;

public class ProgressMessage {

    String message;
    private static final String TYPE = "GRADLE_PROGRESS";

    public ProgressMessage(String message) {
        this.message = message;
    }

    public String toString() {
        return Json.object().add("type", TYPE).add("message", message).toString();
    }
}
