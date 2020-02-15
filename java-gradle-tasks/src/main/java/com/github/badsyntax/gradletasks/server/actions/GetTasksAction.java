package com.github.badsyntax.gradletasks.server.actions;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import com.github.badsyntax.gradletasks.server.actions.exceptions.ActionException;
import com.github.badsyntax.gradletasks.server.listeners.GradleOutputListener;
import com.github.badsyntax.gradletasks.server.listeners.GradleProgressListener;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.GradleProject;
import org.java_websocket.WebSocket;

public class GetTasksAction extends Action {

    @Inject
    public GetTasksAction(final Logger logger, final ExecutorService taskExecutor,
            final GradleTaskPool taskPool) {
        super(logger, taskExecutor, taskPool);
    }

    private final List<ServerMessage.GradleTask> tasks = new ArrayList<ServerMessage.GradleTask>();
    public static final String KEY = "ACTION_GET_TASKS";

    public static String getTaskKey(final File sourceDir) {
        return KEY + sourceDir.getAbsolutePath();
    }

    public void run(final WebSocket connection, final ClientMessage.GetTasks message) {
        taskExecutor.submit(() -> {
            try {
                final File sourceDir = new File(message.getSourceDir().trim());
                if (!sourceDir.exists()) {
                    throw new ActionException("Source directory does not exist");
                }
                getTasks(connection, sourceDir);
            } catch (final Exception e) {
                logError(connection, e.getMessage());
            } finally {
                if (connection.isOpen()) {
                    connection.send(ServerMessage.Message.newBuilder()
                            .setGetTasks(ServerMessage.Tasks.newBuilder()
                                    .setMessage(String.format("Completed %s action", KEY))
                                    .addAllTasks(tasks))
                            .build().toByteArray());
                }
            }
        });
    }

    private void getTasks(final WebSocket connection, final File sourceDir) throws ActionException {
        final ProjectConnection projectConnection =
                GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        final CancellationTokenSource cancellationTokenSource =
                GradleConnector.newCancellationTokenSource();
        taskPool.put(getTaskKey(sourceDir), cancellationTokenSource, GradleTaskPool.TYPE.GET);
        try {
            final ModelBuilder<GradleProject> rootProjectBuilder =
                    projectConnection.model(GradleProject.class);
            rootProjectBuilder.withCancellationToken(cancellationTokenSource.token());
            rootProjectBuilder.addProgressListener(new GradleProgressListener(connection));
            rootProjectBuilder.setStandardOutput(new GradleOutputListener(connection,
                    ServerMessage.OutputChanged.OutputType.STDOUT));
            rootProjectBuilder.setStandardError(new GradleOutputListener(connection,
                    ServerMessage.OutputChanged.OutputType.STDERR));
            rootProjectBuilder.setColorOutput(false);
            final GradleProject rootProject = rootProjectBuilder.get();
            tasks.clear();
            buildTasksListFromProjectTree(rootProject);
        } catch (final Exception err) {
            throw new ActionException(err.getMessage());
        } finally {
            projectConnection.close();
        }
    }

    private void buildTasksListFromProjectTree(final GradleProject project) {
        buildTasksListFromProjectTree(project, project);
    }

    private void buildTasksListFromProjectTree(final GradleProject project,
            final GradleProject rootProject) {
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
