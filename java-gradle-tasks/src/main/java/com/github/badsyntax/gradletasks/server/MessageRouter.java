package com.github.badsyntax.gradletasks.server;

import java.util.HashMap;
import java.util.Map;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.server.handlers.exceptions.MessageRouterException;
import com.github.badsyntax.gradletasks.server.handlers.MessageHandler;
import org.java_websocket.WebSocket;

public class MessageRouter {

    private Map<ClientMessage.Message.KindCase, MessageHandler> messageHandlers = new HashMap<>();

    @Inject
    public MessageRouter() {
    }

    public void registerMessageHandler(ClientMessage.Message.KindCase kind, MessageHandler handler) {
        this.messageHandlers.put(kind, handler);
    }

    public void routeToMessageHandler(WebSocket connection, ClientMessage.Message message)
            throws MessageRouterException {
        MessageHandler handler = this.messageHandlers.get(message.getKindCase());
        if (handler != null) {
            handler.handle(connection, message);
        } else {
            throw new MessageRouterException(
                    String.format("Message handler not found for kind {0}", message.getKindCase()));
        }
    }
}
