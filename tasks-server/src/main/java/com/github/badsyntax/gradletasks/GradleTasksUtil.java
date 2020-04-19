package com.github.badsyntax.gradletasks;

import java.io.File;
import java.util.List;
import java.util.Map;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProjectConnection;
import io.grpc.stub.StreamObserver;

public class GradleTasksUtil {

  private static CancellationTokenPool cancellationTokenPool = new CancellationTokenPool();

  private GradleTasksUtil() {
  }

  public static void getProject(File sourceDir,
      StreamObserver<GetProjectReply> responseObserver) throws GradleTasksException {
    CancellationTokenSource cancellationTokenSource = GradleConnector.newCancellationTokenSource();
    GradleConnector gradleConnector = GradleConnector.newConnector().forProjectDirectory(sourceDir);
    String cancellationKey = sourceDir.getAbsolutePath();
    cancellationTokenPool.put(CancellationTokenPool.TYPE.GET, cancellationKey,
        cancellationTokenSource);
    try (ProjectConnection projectConnection = gradleConnector.connect()) {
      ModelBuilder<org.gradle.tooling.model.GradleProject> rootProjectBuilder =
          projectConnection.model(org.gradle.tooling.model.GradleProject.class);
      rootProjectBuilder.withCancellationToken(cancellationTokenSource.token())
          .addProgressListener((ProgressEvent progressEvent) -> {
            Progress progress =
                Progress.newBuilder().setMessage(progressEvent.getDescription()).build();
            GetProjectReply reply = GetProjectReply.newBuilder().setProgress(progress).build();
            responseObserver.onNext(reply);
          }).setStandardOutput(new GradleOutputListener() {
            @Override
            public final void onOutputChanged(String outputMessage) {
              Output output = Output.newBuilder().setOutputType(Output.OutputType.STDOUT)
                  .setMessage(outputMessage).build();
              GetProjectReply reply = GetProjectReply.newBuilder().setOutput(output).build();
              responseObserver.onNext(reply);
            }
          }).setStandardError(new GradleOutputListener() {
            @Override
            public final void onOutputChanged(String outputMessage) {
              Output output = Output.newBuilder().setOutputType(Output.OutputType.STDERR)
                  .setMessage(outputMessage).build();
              GetProjectReply reply = GetProjectReply.newBuilder().setOutput(output).build();
              responseObserver.onNext(reply);
            }
          }).setColorOutput(false);
      GradleProject gradleProject = buildProject(rootProjectBuilder.get());
      GetProjectResult result = GetProjectResult.newBuilder().setProject(gradleProject).build();
      GetProjectReply reply = GetProjectReply.newBuilder().setGetProjectResult(result).build();
      responseObserver.onNext(reply);
    } catch (BuildCancelledException e) {
      Cancelled cancelled = Cancelled.newBuilder().setMessage(e.getMessage())
          .setSourceDir(sourceDir.getPath()).build();
      GetProjectReply reply = GetProjectReply.newBuilder().setCancelled(cancelled).build();
      responseObserver.onNext(reply);
    } catch (RuntimeException err) {
      throw new GradleTasksException(err.getMessage(), err);
    } finally {
      cancellationTokenPool.remove(CancellationTokenPool.TYPE.RUN, cancellationKey);
    }
  }

  public static void runTask(File sourceDir, String task, List<String> args,
      StreamObserver<RunTaskReply> responseObserver) throws GradleTasksException {
    GradleConnector gradleConnector = GradleConnector.newConnector().forProjectDirectory(sourceDir);
    CancellationTokenSource cancellationTokenSource = GradleConnector.newCancellationTokenSource();
    String cancellationKey = sourceDir.getAbsolutePath() + task;
    cancellationTokenPool.put(CancellationTokenPool.TYPE.RUN, cancellationKey,
        cancellationTokenSource);
    try (ProjectConnection projectConnection = gradleConnector.connect()) {
      BuildLauncher build =
          projectConnection.newBuild().withCancellationToken(cancellationTokenSource.token())
              .addProgressListener((ProgressEvent progressEvent) -> {
                Progress progress =
                    Progress.newBuilder().setMessage(progressEvent.getDescription()).build();
                RunTaskReply reply = RunTaskReply.newBuilder().setProgress(progress).build();
                responseObserver.onNext(reply);
              }).setStandardOutput(new GradleOutputListener() {
                @Override
                public final void onOutputChanged(String outputMessage) {
                  Output output = Output.newBuilder().setOutputType(Output.OutputType.STDOUT)
                      .setMessage(outputMessage).build();
                  RunTaskReply reply = RunTaskReply.newBuilder().setOutput(output).build();
                  responseObserver.onNext(reply);
                }
              }).setStandardError(new GradleOutputListener() {
                @Override
                public final void onOutputChanged(String outputMessage) {
                  Output output = Output.newBuilder().setOutputType(Output.OutputType.STDERR)
                      .setMessage(outputMessage).build();
                  RunTaskReply reply = RunTaskReply.newBuilder().setOutput(output).build();
                  responseObserver.onNext(reply);
                }
              }).setColorOutput(true).withArguments(args).forTasks(task);
      build.run();
      RunTaskResult result =
          RunTaskResult.newBuilder().setMessage("Successfully run task").setTask(task).build();
      RunTaskReply reply = RunTaskReply.newBuilder().setRunTaskResult(result).build();
      responseObserver.onNext(reply);
    } catch (BuildCancelledException e) {
      Cancelled cancelled = Cancelled.newBuilder().setMessage(e.getMessage()).setTask(task)
          .setSourceDir(sourceDir.getPath()).build();
      RunTaskReply reply = RunTaskReply.newBuilder().setCancelled(cancelled).build();
      responseObserver.onNext(reply);
    } finally {
      cancellationTokenPool.remove(CancellationTokenPool.TYPE.RUN, cancellationKey);
    }
  }

  public static void cancelGetProjects(StreamObserver<CancelGetProjectsReply> responseObserver) {
    Map<String, CancellationTokenSource> pool =
        cancellationTokenPool.getPoolType(CancellationTokenPool.TYPE.GET);
    pool.keySet().stream().forEach(key -> pool.get(key).cancel());
    CancelGetProjectsReply reply =
        CancelGetProjectsReply.newBuilder().setMessage("Cancel get projects requested").build();
    responseObserver.onNext(reply);
  }

  public static void cancelRunTask(File sourceDir, String task,
      StreamObserver<CancelRunTaskReply> responseObserver) {
    String cancellationKey = sourceDir.getAbsolutePath() + task;
    CancellationTokenSource cancellationTokenSource =
        cancellationTokenPool.get(CancellationTokenPool.TYPE.RUN, cancellationKey);
    if (cancellationTokenSource != null) {
      cancellationTokenSource.cancel();
    }
    CancelRunTaskReply reply =
        CancelRunTaskReply.newBuilder().setMessage("Cancel run task requested").build();
    responseObserver.onNext(reply);
  }

  public static void cancelRunTasks(StreamObserver<CancelRunTasksReply> responseObserver) {
    Map<String, CancellationTokenSource> pool =
        cancellationTokenPool.getPoolType(CancellationTokenPool.TYPE.RUN);
    pool.keySet().stream().forEach(key -> pool.get(key).cancel());
    CancelRunTasksReply reply =
        CancelRunTasksReply.newBuilder().setMessage("Cancel run tasks requested").build();
    responseObserver.onNext(reply);
  }

  private static GradleProject buildProject(org.gradle.tooling.model.GradleProject gradleProject) {
    GradleProject.Builder project =
        GradleProject.newBuilder().setIsRoot(gradleProject.getParent() == null);
    gradleProject.getChildren().stream().forEach(childGradleProject -> {
      project.addSubProjects(buildProject(childGradleProject));
    });
    gradleProject.getTasks().stream().forEach(task -> {
      GradleTask.Builder gradleTask = GradleTask.newBuilder()
          .setProject(task.getProject().getName()).setName(task.getName()).setPath(task.getPath())
          .setBuildFile(task.getProject().getBuildScript().getSourceFile().getAbsolutePath())
          .setRootProject(gradleProject.getName());
      if (task.getDescription() != null) {
        gradleTask.setDescription(task.getDescription());
      }
      if (task.getGroup() != null) {
        gradleTask.setGroup(task.getGroup());
      }
      project.addTasks(gradleTask.build());
    });
    return project.build();
  }
}
