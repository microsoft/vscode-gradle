package com.github.badsyntax.gradletasks.server.messages;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;

public class ClientMessage {

    private JsonObject messageObject;

    public ClientMessage(String message) {
        this.messageObject = Json.parse(message).asObject();
    }

    public JsonObject getMessage() {
        return this.messageObject;
    }
}
