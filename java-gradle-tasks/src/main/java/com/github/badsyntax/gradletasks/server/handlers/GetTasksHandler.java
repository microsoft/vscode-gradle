package com.github.badsyntax.gradletasks.server.handlers;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import javax.inject.Inject;
import javax.inject.Singleton;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.ConnectionUtil;
import com.github.badsyntax.gradletasks.server.TaskCancellationPool;
import com.github.badsyntax.gradletasks.server.handlers.exceptions.MessageHandlerException;
import com.github.badsyntax.gradletasks.server.listeners.GradleOutputListener;
import com.github.badsyntax.gradletasks.server.listeners.GradleProgressListener;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.GradleProject;
import org.java_websocket.WebSocket;

@Singleton
public class GetTasksHandler implements MessageHandler {

    @Inject
    protected Logger logger;

    @Inject
    protected ExecutorService taskExecutor;

    @Inject
    protected TaskCancellationPool taskPool;

    @Inject
    public GetTasksHandler() {
    }

    private List<ServerMessage.GradleTask> tasks = new ArrayList<>();

    private static final String KEY = "ACTION_GET_TASKS";

    public static String getKey(File sourceDir) {
        return KEY + sourceDir.getAbsolutePath();
    }

    @Override
    public void handle(WebSocket connection, ClientMessage.Message message) {
        taskExecutor.submit(() -> {
            try {
                File sourceDir = new File(message.getGetTasks().getSourceDir().trim());
                if (!sourceDir.exists()) {
                    throw new MessageHandlerException("Source directory does not exist");
                }
                getTasks(connection, sourceDir);
            } catch (Exception e) {
                logger.warning(e.getMessage());
                ConnectionUtil.sendErrorMessage(connection, e.getMessage());
            } finally {
                if (connection.isOpen()) {
                    connection.send(ServerMessage.Message.newBuilder()
                            .setGetTasks(ServerMessage.Tasks.newBuilder()
                                    .setMessage(String.format("Completed %s", KEY))
                                    .addAllTasks(tasks))
                            .build().toByteArray());
                }
            }
        });
    }

    private void getTasks(WebSocket connection, File sourceDir) throws MessageHandlerException {
        ProjectConnection projectConnection =
                GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        CancellationTokenSource cancellationTokenSource =
                GradleConnector.newCancellationTokenSource();
        String key = getKey(sourceDir);
        taskPool.put(key, cancellationTokenSource, TaskCancellationPool.TYPE.GET);
        try {
            ModelBuilder<GradleProject> rootProjectBuilder =
                    projectConnection.model(GradleProject.class);
            rootProjectBuilder.withCancellationToken(cancellationTokenSource.token())
                    .addProgressListener(new GradleProgressListener(connection))
                    .setStandardOutput(new GradleOutputListener(connection,
                            ServerMessage.OutputChanged.OutputType.STDOUT))
                    .setStandardError(new GradleOutputListener(connection,
                            ServerMessage.OutputChanged.OutputType.STDERR))
                    .setColorOutput(false);
            GradleProject rootProject = rootProjectBuilder.get();
            tasks.clear();
            buildTasksListFromProjectTree(rootProject);
        } finally {
            projectConnection.close();
            taskPool.remove(key, TaskCancellationPool.TYPE.GET);
        }
    }

    private void buildTasksListFromProjectTree(GradleProject project) {
        buildTasksListFromProjectTree(project, project);
    }

    private void buildTasksListFromProjectTree(GradleProject project, GradleProject rootProject) {
        project.getTasks().stream().forEach(task -> {
            ServerMessage.GradleTask.Builder gradleTask = ServerMessage.GradleTask.newBuilder()
                    .setProject(task.getProject().getName()).setName(task.getName())
                    .setPath(task.getPath())
                    .setBuildFile(
                            task.getProject().getBuildScript().getSourceFile().getAbsolutePath())
                    .setRootProject(rootProject.getName());
            if (task.getDescription() != null) {
                gradleTask.setDescription(task.getDescription());
            }
            if (task.getGroup() != null) {
                gradleTask.setGroup(task.getGroup());
            }
            tasks.add(gradleTask.build());
        });
        project.getChildren().stream()
                .forEach(childProject -> buildTasksListFromProjectTree(childProject, rootProject));
    }
}
