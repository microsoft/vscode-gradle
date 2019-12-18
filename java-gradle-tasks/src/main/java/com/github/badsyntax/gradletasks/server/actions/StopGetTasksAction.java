package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.Map;
import com.github.badsyntax.gradletasks.server.GradleTasksServerException;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.server.WebSocketServer;

public class StopGetTasksAction implements Action {
    private File sourceDir;
    private Map<String, CancellationTokenSource> getTasksPool;

    public StopGetTasksAction(WebSocketServer server, File sourceDir, Map<String, CancellationTokenSource> getTasksPool) {
        this.sourceDir = sourceDir;
        this.getTasksPool = getTasksPool;
    }

    public void run() throws GradleTasksServerException {
        if (!sourceDir.exists()) {
            throw new GradleTasksServerException("Source directory does not exist");
        }
        String key = sourceDir.getAbsolutePath();
        CancellationTokenSource cancellationTokenSource = getTasksPool.get(key);
        if (cancellationTokenSource != null) {
            cancellationTokenSource.cancel();
        }
    }
}
