package com.github.badsyntax.gradletasks.server.listeners;

import com.github.badsyntax.gradletasks.server.messages.ProgressMessage;

import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProgressListener;
import org.java_websocket.server.WebSocketServer;

public class GradleProgressListener implements ProgressListener {
    private WebSocketServer server;

    public GradleProgressListener(WebSocketServer server) {
        this.server = server;
    }

    @Override
    public void statusChanged(ProgressEvent progressEvent) {
        server.broadcast(
                new ProgressMessage(progressEvent.getDescription()).toString());
    }
}
