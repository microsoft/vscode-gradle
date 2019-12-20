package com.github.badsyntax.gradletasks.server.listeners;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.server.messages.OutputChangedMessage;
import org.java_websocket.WebSocket;

public class GradleOutputListener extends OutputStream {
    public enum TYPES {
        STDERR, STDOUT,
    }

    private WebSocket connection;
    private final ByteArrayOutputStream baos = new ByteArrayOutputStream();
    private String typeString;

    @Inject
    public GradleOutputListener(WebSocket connection, TYPES type) {
        this.connection = connection;
        this.typeString = type.toString();
    }

    @Override
    public final void write(int b) throws IOException {
        char c = (char) b;
        if (c == System.lineSeparator().charAt(0)) {
            connection.send(new OutputChangedMessage(baos.toString(), typeString).toString());
            baos.reset();
        } else {
            baos.write(b);
        }
    }
}
