package com.github.badsyntax.gradletasks.server.messages;

import com.eclipsesource.json.Json;

public class GenericMessage {

    protected String message;
    protected String type;

    public GenericMessage(String message, String type) {
        this.message = message;
        this.type = type;
    }

    public String toString() {
        return Json.object().add("type", type).add("message", message).toString();
    }
}
