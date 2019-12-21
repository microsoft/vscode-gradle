package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.messages.TasksMessage;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.GradleProject;
import org.java_websocket.WebSocket;

public class GetTasksAction extends Action {
    private JsonArray jsonTasks = Json.array();
    public static final String KEY = "getTasks";

    public GetTasksAction(WebSocket connection, JsonObject message, ExecutorService taskExecutor,
            Logger logger, GradleTaskPool taskPool) {
        super(connection, message, taskExecutor, logger, taskPool);
    }

    public JsonArray getJsonTasks() {
        return jsonTasks;
    }

    public static String getTaskKey(File sourceDir) {
        return KEY + sourceDir.getAbsolutePath();
    }

    public void run() {
        taskExecutor.submit(() -> {
            try {
                File sourceDir = new File(message.get(MESSAGE_SOURCE_DIR_KEY).asString());
                if (!sourceDir.exists()) {
                    throw new ActionException("Source directory does not exist");
                }
                getTasks(sourceDir);
            } catch (Exception e) {
                logError(e.getMessage());
            } finally {
                if (connection.isOpen()) {
                    connection.send(
                            new TasksMessage(String.format("Completed %s action", KEY), jsonTasks)
                                    .toString());
                }
            }
        });
    }

    private void getTasks(File sourceDir) throws ActionException {
        ProjectConnection projectConnection =
                GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        CancellationTokenSource cancellationTokenSource =
                GradleConnector.newCancellationTokenSource();
        taskPool.put(getTaskKey(sourceDir), cancellationTokenSource, GradleTaskPool.TYPE.GET);
        try {
            ModelBuilder<GradleProject> rootProjectBuilder =
                    projectConnection.model(GradleProject.class);
            rootProjectBuilder.withCancellationToken(cancellationTokenSource.token());
            rootProjectBuilder.addProgressListener(progressListener);
            rootProjectBuilder.setStandardOutput(stdOutListener);
            rootProjectBuilder.setStandardError(stdErrListener);
            rootProjectBuilder.setColorOutput(false);
            GradleProject rootProject = rootProjectBuilder.get();
            buildTasksListFromProjectTree(rootProject);
        } catch (Exception err) {
            throw new ActionException(err.getMessage());
        } finally {
            projectConnection.close();
        }
    }

    private void buildTasksListFromProjectTree(GradleProject project) {
        buildTasksListFromProjectTree(project, project);
    }

    private void buildTasksListFromProjectTree(GradleProject project, GradleProject rootProject) {
        project.getTasks().stream().map(task -> Json.object().add("name", task.getName())
                .add("group", task.getGroup()).add("path", task.getPath())
                .add("project", task.getProject().getName())
                .add("buildFile",
                        task.getProject().getBuildScript().getSourceFile().getAbsolutePath())
                .add("rootProject", rootProject.getName())
                .add("description", task.getDescription())).forEach(jsonTasks::add);
        project.getChildren().stream()
                .forEach(childProject -> buildTasksListFromProjectTree(childProject, rootProject));
    }
}
