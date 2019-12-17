package com.github.badsyntax.gradletasks.server.listeners;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;

import com.github.badsyntax.gradletasks.server.messages.OutputChangedMessage;

import org.java_websocket.server.WebSocketServer;

public class GradleOutputListener extends OutputStream {
    public enum TYPES {
        STDERR, STDOUT,
    }

    private WebSocketServer server;
    private final ByteArrayOutputStream baos = new ByteArrayOutputStream();
    private String typeString;

    public GradleOutputListener(WebSocketServer server, TYPES type) {
        this.server = server;
        this.typeString = type.toString();
    }

    @Override
    public final void write(int b) throws IOException {
        char c = (char) b;
        if (c == System.lineSeparator().charAt(0)) {
            server.broadcast(new OutputChangedMessage(baos.toString(), typeString).toString());
            baos.reset();
        } else {
            baos.write(b);
        }
    }
}
