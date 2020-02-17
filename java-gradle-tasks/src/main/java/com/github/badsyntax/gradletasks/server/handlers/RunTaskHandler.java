package com.github.badsyntax.gradletasks.server.handlers;

import java.io.File;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.ConnectionUtil;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.handlers.exceptions.MessageHandlerException;
import com.github.badsyntax.gradletasks.server.handlers.exceptions.TaskCancelledException;
import com.github.badsyntax.gradletasks.server.listeners.GradleOutputListener;
import com.github.badsyntax.gradletasks.server.listeners.GradleProgressListener;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.java_websocket.WebSocket;

public class RunTaskHandler implements MessageHandler {

    @Inject
    protected Logger logger;

    @Inject
    protected ExecutorService taskExecutor;

    @Inject
    protected GradleTaskPool taskPool;

    @Inject
    public RunTaskHandler() {

    }

    private static final String KEY = "ACTION_RUN_TASK";

    public static String getKey(File sourceDir) {
        return KEY + sourceDir.getAbsolutePath();
    }

    public static String getTaskKey(File sourceDir, String task) {
        return getKey(sourceDir) + task;
    }

    @Override
    public void handle(WebSocket connection, ClientMessage.Message clientMessage) {
        taskExecutor.submit(() -> {
            ClientMessage.RunTask message = clientMessage.getRunTask();
            try {
                File sourceDir = new File(message.getSourceDir().trim());
                runTask(connection, sourceDir, message.getTask(), message.getArgsList());
            } catch (TaskCancelledException e) {
                connection.send(ServerMessage.Message.newBuilder()
                        .setActionCancelled(ServerMessage.ActionCancelled.newBuilder()
                                .setMessage(e.getMessage()).setTask(message.getTask())
                                .setSourceDir(message.getSourceDir().trim()))
                        .build().toByteArray());
            } catch (MessageHandlerException e) {
                logger.warning(e.getMessage());
                ConnectionUtil.sendErrorMessage(connection, e.getMessage());
            } finally {
                if (connection.isOpen()) {
                    connection.send(ServerMessage.Message.newBuilder()
                            .setRunTask(ServerMessage.RunTask.newBuilder()
                                    .setMessage(String.format("Completed %s", KEY))
                                    .setTask(message.getTask()))
                            .build().toByteArray());
                }
            }
        });
    }

    private void runTask(WebSocket connection, File sourceDir, String task, List<String> args)
            throws MessageHandlerException, TaskCancelledException {
        ProjectConnection projectConnection =
                GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        CancellationTokenSource cancellationTokenSource =
                GradleConnector.newCancellationTokenSource();
        try {
            taskPool.put(getTaskKey(sourceDir, task), cancellationTokenSource,
                    GradleTaskPool.TYPE.RUN);
            BuildLauncher build = projectConnection.newBuild()
                    .withCancellationToken(cancellationTokenSource.token())
                    .addProgressListener(new GradleProgressListener(connection))
                    .setStandardOutput(new GradleOutputListener(connection,
                            ServerMessage.OutputChanged.OutputType.STDOUT))
                    .setStandardError(new GradleOutputListener(connection,
                            ServerMessage.OutputChanged.OutputType.STDERR))
                    .setColorOutput(true).withArguments(args).forTasks(task);
            build.run();
        } catch (BuildCancelledException err) {
            throw new TaskCancelledException(err.getMessage());
        } catch (Exception err) {
            throw new MessageHandlerException(err.getMessage());
        } finally {
            projectConnection.close();
        }
    }
}
