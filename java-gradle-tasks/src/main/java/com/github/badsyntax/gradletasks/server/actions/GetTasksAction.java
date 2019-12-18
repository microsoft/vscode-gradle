package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.Map;
import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;
import com.github.badsyntax.gradletasks.server.GradleTasksServerException;
import com.github.badsyntax.gradletasks.server.listeners.GradleOutputListener;
import com.github.badsyntax.gradletasks.server.listeners.GradleProgressListener;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.GradleProject;
import org.java_websocket.server.WebSocketServer;

public class GetTasksAction implements Action {
    private File sourceDir;
    private WebSocketServer server;
    private GradleProgressListener progressListener;
    private GradleOutputListener stdoutListener;
    private GradleOutputListener stderrListener;
    private Map<String, CancellationTokenSource> getTasksPool;
    private JsonArray jsonTasks = Json.array();

    public GetTasksAction(WebSocketServer server, File sourceDir, Map<String, CancellationTokenSource> getTasksPool) {
        this.server = server;
        this.sourceDir = sourceDir;
        this.progressListener = new GradleProgressListener(server);
        this.stdoutListener = new GradleOutputListener(server, GradleOutputListener.TYPES.STDOUT);
        this.stderrListener = new GradleOutputListener(server, GradleOutputListener.TYPES.STDERR);
        this.getTasksPool = getTasksPool;
    }

    public JsonArray getJsonTasks() {
        return jsonTasks;
    }

    public void run() throws GradleTasksServerException {
        if (!sourceDir.exists()) {
            throw new GradleTasksServerException("Source directory does not exist");
        }
        ProjectConnection connection = GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        CancellationTokenSource cancellationTokenSource =
                GradleConnector.newCancellationTokenSource();
        String key = sourceDir.getAbsolutePath();
        getTasksPool.put(key, cancellationTokenSource);
        try {
            ModelBuilder<GradleProject> rootProjectBuilder = connection.model(GradleProject.class);
            rootProjectBuilder.withCancellationToken(cancellationTokenSource.token());
            rootProjectBuilder.addProgressListener(progressListener);
            rootProjectBuilder.setStandardOutput(stdoutListener);
            rootProjectBuilder.setStandardError(stderrListener);
            rootProjectBuilder.setColorOutput(false);
            GradleProject rootProject = rootProjectBuilder.get();
            buildTasksListFromProjectTree(rootProject);
        } catch (Exception err) {
            throw new GradleTasksServerException(err.getMessage());
        } finally {
            connection.close();
        }
    }

    private void buildTasksListFromProjectTree(GradleProject project) {
        buildTasksListFromProjectTree(project, project);
    }

    private void buildTasksListFromProjectTree(GradleProject project, GradleProject rootProject) {
        project.getTasks().stream()
                .map(task -> Json.object().add("name", task.getName()).add("group", task.getGroup())
                        .add("path", task.getPath()).add("project", task.getProject().getName())
                        .add("buildFile", task.getProject().getBuildScript().getSourceFile().getAbsolutePath())
                        .add("rootProject", rootProject.getName()).add("description", task.getDescription()))
                .forEach(jsonTasks::add);
        project.getChildren().stream()
                .forEach(childProject -> buildTasksListFromProjectTree(childProject, rootProject));
    }
}
