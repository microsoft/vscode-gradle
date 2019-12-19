package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.Map;
import com.github.badsyntax.gradletasks.server.GradleTasksServerException;
import org.gradle.tooling.CancellationTokenSource;
import org.java_websocket.server.WebSocketServer;

public class StopTaskAction implements Action {
    private File sourceDir;
    private String task;
    private Map<String, CancellationTokenSource> taskPool;

    public StopTaskAction(WebSocketServer server, File sourceDir, String task,
            Map<String, CancellationTokenSource> taskPool) {
        this.sourceDir = sourceDir;
        this.task = task;
        this.taskPool = taskPool;
    }

    public void run() throws GradleTasksServerException {
        if (!sourceDir.exists()) {
            throw new GradleTasksServerException("Source directory does not exist");
        }
        String key = sourceDir.getAbsolutePath() + task;
        CancellationTokenSource cancellationTokenSource = taskPool.get(key);
        if (cancellationTokenSource != null) {
            cancellationTokenSource.cancel();
            taskPool.remove(key);
        }
    }
}
