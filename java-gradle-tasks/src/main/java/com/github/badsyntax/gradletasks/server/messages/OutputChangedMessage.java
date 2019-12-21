package com.github.badsyntax.gradletasks.server.messages;

import com.eclipsesource.json.Json;

public class OutputChangedMessage {

    String message;
    String outputType;
    private static final String TYPE = "GRADLE_OUTPUT";

    public OutputChangedMessage(String message, String outputType) {
        this.message = message;
        this.outputType = outputType;
    }

    public String toString() {
        return Json.object().add("type", TYPE).add("message", message)
                .add("outputType", outputType).toString();
    }
}
