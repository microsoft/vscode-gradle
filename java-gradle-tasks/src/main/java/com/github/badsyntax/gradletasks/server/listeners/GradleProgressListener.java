package com.github.badsyntax.gradletasks.server.listeners;

import com.github.badsyntax.gradletasks.server.messages.ProgressMessage;
import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProgressListener;
import org.java_websocket.WebSocket;

public class GradleProgressListener implements ProgressListener {
    private WebSocket connection;

    public GradleProgressListener(WebSocket connection) {
        this.connection = connection;
    }

    @Override
    public void statusChanged(ProgressEvent progressEvent) {
        connection.send(new ProgressMessage(progressEvent.getDescription()).toString());
    }
}
