package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;

import javax.inject.Inject;

import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.actions.exceptions.ActionCancelledException;
import com.github.badsyntax.gradletasks.server.actions.exceptions.ActionException;
import com.github.badsyntax.gradletasks.server.listeners.GradleOutputListener;
import com.github.badsyntax.gradletasks.server.listeners.GradleProgressListener;

import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.java_websocket.WebSocket;

public class RunTaskAction extends Action {

    @Inject
    public RunTaskAction(Logger logger, ExecutorService taskExecutor, GradleTaskPool taskPool) {
        super(logger, taskExecutor, taskPool);
        // TODO Auto-generated constructor stub
    }

    public static final String KEY = "ACTION_RUN_TASK";

    public static String getTaskKey(File sourceDir, String task) {
        return KEY + sourceDir.getAbsolutePath() + task;
    }

    public void run(WebSocket connection, ClientMessage.RunTask message) {
        taskExecutor.submit(() -> {
            try {
                File sourceDir = new File(message.getSourceDir().trim());
                runTask(connection, sourceDir, message.getTask(), message.getArgsList());
            } catch (ActionCancelledException e) {
                connection.send(ServerMessage.Message.newBuilder()
                        .setActionCancelled(ServerMessage.ActionCancelled.newBuilder()
                                .setMessage(e.getMessage()).setTask(message.getTask())
                                .setSourceDir(message.getSourceDir().trim()))
                        .build().toByteArray());
            } catch (ActionException e) {
                logError(connection, e.getMessage());
            } finally {
                if (connection.isOpen()) {
                    connection.send(ServerMessage.Message.newBuilder()
                            .setRunTask(ServerMessage.RunTask.newBuilder()
                                    .setMessage(String.format("Completed %s action", KEY))
                                    .setTask(message.getTask()))
                            .build().toByteArray());
                }
            }
        });
    }

    private void runTask(WebSocket connection, File sourceDir, String task, List<String> args)
            throws ActionException, ActionCancelledException {
        ProjectConnection projectConnection =
                GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        CancellationTokenSource cancellationTokenSource =
                GradleConnector.newCancellationTokenSource();
        try {
            taskPool.put(getTaskKey(sourceDir, task), cancellationTokenSource,
                    GradleTaskPool.TYPE.RUN);
            BuildLauncher build = projectConnection.newBuild();
            build.withCancellationToken(cancellationTokenSource.token());
            build.addProgressListener(new GradleProgressListener(connection));
            build.setStandardOutput(new GradleOutputListener(connection,
                    ServerMessage.OutputChanged.OutputType.STDOUT));
            build.setStandardError(new GradleOutputListener(connection,
                    ServerMessage.OutputChanged.OutputType.STDERR));
            build.setColorOutput(true);
            build.withArguments(args);
            build.forTasks(task);
            build.run();
        } catch (BuildCancelledException err) {
            throw new ActionCancelledException(err.getMessage());
        } catch (Exception err) {
            throw new ActionException(err.getMessage());
        } finally {
            projectConnection.close();
        }
    }
}
