package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.messages.ActionCancelledMessage;
import com.github.badsyntax.gradletasks.server.messages.RunTaskMessage;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.java_websocket.WebSocket;

public class RunTaskAction extends Action {

    public static final String KEY = "runTask";

    public RunTaskAction(WebSocket connection, JsonObject message, ExecutorService taskExecutor,
            Logger logger, GradleTaskPool taskPool) {
        super(connection, message, taskExecutor, logger, taskPool);
    }

    public static String getTaskKey(File sourceDir, String task) {
        return KEY + sourceDir.getAbsolutePath() + task;
    }

    public void run() {
        taskExecutor.submit(() -> {
            String task = "";
            String sourceDirStr = "";
            try {
                task = message.get(MESSAGE_TASK_KEY).asString();
                sourceDirStr = message.get(MESSAGE_SOURCE_DIR_KEY).asString();
                File sourceDir = new File(sourceDirStr);
                String[] args = message.get(MESSAGE_TASK_ARGS_KEY).asArray().values().stream()
                        .map(JsonValue::asString).toArray(String[]::new);
                if (!sourceDir.exists()) {
                    throw new ActionException("Source directory does not exist");
                }
                runTask(sourceDir, task, args);
            } catch (ActionCancelledException e) {
                connection.send(new ActionCancelledMessage(e.getMessage(), task, sourceDirStr).toString());
            } catch (ActionException e) {
                logError(e.getMessage());
            } finally {
                if (connection.isOpen()) {
                    connection.send(
                            new RunTaskMessage(String.format("Completed %s action", KEY), task)
                                    .toString());
                }
            }
        });
    }

    private void runTask(File sourceDir, String task, String[] args)
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
            build.addProgressListener(progressListener);
            build.setStandardOutput(stdOutListener);
            build.setStandardError(stdErrListener);
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
