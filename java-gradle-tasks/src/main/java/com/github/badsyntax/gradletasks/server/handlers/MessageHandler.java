package com.github.badsyntax.gradletasks.server.handlers;

import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import org.java_websocket.WebSocket;

public interface MessageHandler {

  public void handle(WebSocket connection, ClientMessage.Message message);
}
