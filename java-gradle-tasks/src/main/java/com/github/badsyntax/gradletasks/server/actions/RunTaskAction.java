package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.Map;
import com.github.badsyntax.gradletasks.server.GradleTasksServerException;
import com.github.badsyntax.gradletasks.server.listeners.GradleOutputListener;
import com.github.badsyntax.gradletasks.server.listeners.GradleProgressListener;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.java_websocket.server.WebSocketServer;

public class RunTaskAction implements Action {
    private File sourceDir;
    private GradleProgressListener progressListener;
    private GradleOutputListener stdoutListener;
    private GradleOutputListener stderrListener;
    private String tasks;
    private Map<String, CancellationTokenSource> taskPool;

    public RunTaskAction(WebSocketServer server, File sourceDir, String tasks,
            Map<String, CancellationTokenSource> taskPool) {
        this.sourceDir = sourceDir;
        this.progressListener = new GradleProgressListener(server);
        this.stdoutListener = new GradleOutputListener(server, GradleOutputListener.TYPES.STDOUT);
        this.stderrListener = new GradleOutputListener(server, GradleOutputListener.TYPES.STDERR);
        this.tasks = tasks;
        this.taskPool = taskPool;
    }

    public void run() throws GradleTasksServerException {
        if (!sourceDir.exists()) {
            throw new GradleTasksServerException("Source directory does not exist");
        }
        ProjectConnection connection =
                GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        CancellationTokenSource cancellationTokenSource =
                GradleConnector.newCancellationTokenSource();
        try {
            taskPool.put(sourceDir.getAbsolutePath() + tasks, cancellationTokenSource);
            BuildLauncher build = connection.newBuild();
            build.withCancellationToken(cancellationTokenSource.token());
            build.addProgressListener(progressListener);
            build.setStandardOutput(stdoutListener);
            build.setStandardError(stderrListener);
            build.setColorOutput(false);
            build.forTasks(tasks);
            build.run();
        } catch (Exception err) {
            throw new GradleTasksServerException(err.getMessage());
        } finally {
            connection.close();
        }
    }
}
