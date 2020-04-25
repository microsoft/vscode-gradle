package com.github.badsyntax.gradletasks;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.build.BuildEnvironment;
import org.gradle.tooling.model.build.JavaEnvironment;
import io.grpc.stub.StreamObserver;

public class GradleTasksUtil {

  private static CancellationTokenPool cancellationTokenPool = new CancellationTokenPool();
  private static final Object lock = new Object();

  private GradleTasksUtil() {
  }

  public static void getBuild(final File projectDir,
      final StreamObserver<GetBuildReply> responseObserver) throws GradleTasksException {
    CancellationTokenSource cancellationTokenSource = GradleConnector.newCancellationTokenSource();
    GradleConnector gradleConnector =
        GradleConnector.newConnector().forProjectDirectory(projectDir);
    String cancellationKey = projectDir.getAbsolutePath();
    cancellationTokenPool.put(CancellationTokenPool.TYPE.GET, cancellationKey,
        cancellationTokenSource);
    try (ProjectConnection projectConnection = gradleConnector.connect()) {
      ModelBuilder<org.gradle.tooling.model.GradleProject> rootProjectBuilder =
          projectConnection.model(org.gradle.tooling.model.GradleProject.class);
      rootProjectBuilder.withCancellationToken(cancellationTokenSource.token())
          .addProgressListener((ProgressEvent progressEvent) -> {
            synchronized (lock) {
              Progress progress =
                  Progress.newBuilder().setMessage(progressEvent.getDescription()).build();
              GetBuildReply reply = GetBuildReply.newBuilder().setProgress(progress).build();
              responseObserver.onNext(reply);
            }
          }).setStandardOutput(new GradleOutputListener() {
            @Override
            public final void onOutputChanged(ByteArrayOutputStream outputMessage) {
              synchronized (lock) {
                Output output = Output.newBuilder().setOutputType(Output.OutputType.STDOUT)
                    .setMessage(outputMessage.toString()).build();
                GetBuildReply reply = GetBuildReply.newBuilder().setOutput(output).build();
                responseObserver.onNext(reply);
              }
            }
          }).setStandardError(new GradleOutputListener() {
            @Override
            public final void onOutputChanged(ByteArrayOutputStream outputMessage) {
              synchronized (lock) {
                Output output = Output.newBuilder().setOutputType(Output.OutputType.STDERR)
                    .setMessage(outputMessage.toString()).build();
                GetBuildReply reply = GetBuildReply.newBuilder().setOutput(output).build();
                responseObserver.onNext(reply);
              }
            }
          }).setColorOutput(false);
      GradleProject gradleProject = buildProject(rootProjectBuilder.get());
      GradleBuild gradleBuild = GradleBuild.newBuilder().setProject(gradleProject).build();
      GetBuildResult result = GetBuildResult.newBuilder().setBuild(gradleBuild).build();
      GetBuildReply reply = GetBuildReply.newBuilder().setGetBuildResult(result).build();
      responseObserver.onNext(reply);
    } catch (BuildCancelledException e) {
      Cancelled cancelled = Cancelled.newBuilder().setMessage(e.getMessage())
          .setProjectDir(projectDir.getPath()).build();
      GetBuildReply reply = GetBuildReply.newBuilder().setCancelled(cancelled).build();
      responseObserver.onNext(reply);
    } catch (RuntimeException err) {
      throw new GradleTasksException(err.getMessage(), err);
    } finally {
      cancellationTokenPool.remove(CancellationTokenPool.TYPE.GET, cancellationKey);
    }
  }

  public static void runTask(final File projectDir, final String task, final List<String> args,
      final Boolean javaDebug, final int javaDebugPort, final StreamObserver<RunTaskReply> responseObserver) {
    GradleConnector gradleConnector =
        GradleConnector.newConnector().forProjectDirectory(projectDir);
    CancellationTokenSource cancellationTokenSource = GradleConnector.newCancellationTokenSource();
    String cancellationKey = projectDir.getAbsolutePath() + task;
    cancellationTokenPool.put(CancellationTokenPool.TYPE.RUN, cancellationKey,
        cancellationTokenSource);
    try (ProjectConnection projectConnection = gradleConnector.connect()) {
      BuildLauncher build =
          projectConnection.newBuild().withCancellationToken(cancellationTokenSource.token())
              .addProgressListener((ProgressEvent progressEvent) -> {
                synchronized (lock) {
                  Progress progress =
                      Progress.newBuilder().setMessage(progressEvent.getDescription()).build();
                  RunTaskReply reply = RunTaskReply.newBuilder().setProgress(progress).build();
                  responseObserver.onNext(reply);
                }
              }).setStandardOutput(new GradleOutputListener() {
                @Override
                public final void onOutputChanged(ByteArrayOutputStream outputMessage) {
                  synchronized (lock) {

                    Output output = Output.newBuilder().setOutputType(Output.OutputType.STDOUT)
                        .setMessage(outputMessage.toString()).build();
                    RunTaskReply reply = RunTaskReply.newBuilder().setOutput(output).build();
                    responseObserver.onNext(reply);
                  }
                }
              }).setStandardError(new GradleOutputListener() {
                @Override
                public final void onOutputChanged(ByteArrayOutputStream outputMessage) {
                  synchronized (lock) {
                    Output output = Output.newBuilder().setOutputType(Output.OutputType.STDERR)
                        .setMessage(outputMessage.toString()).build();
                    RunTaskReply reply = RunTaskReply.newBuilder().setOutput(output).build();
                    responseObserver.onNext(reply);
                  }
                }
              }).setColorOutput(true).withArguments(args).forTasks(task);
      if (javaDebug) {
        build.setEnvironmentVariables(getDebugJvmArgument(projectConnection, javaDebugPort));
      }
      build.run();
      RunTaskResult result =
          RunTaskResult.newBuilder().setMessage("Successfully run task").setTask(task).build();
      RunTaskReply reply = RunTaskReply.newBuilder().setRunTaskResult(result).build();
      responseObserver.onNext(reply);
    } catch (BuildCancelledException e) {
      Cancelled cancelled = Cancelled.newBuilder().setMessage(e.getMessage()).setTask(task)
          .setProjectDir(projectDir.getPath()).build();
      RunTaskReply reply = RunTaskReply.newBuilder().setCancelled(cancelled).build();
      responseObserver.onNext(reply);
    } finally {
      cancellationTokenPool.remove(CancellationTokenPool.TYPE.RUN, cancellationKey);
    }
  }

  private static Map<String, String> getDebugJvmArgument(ProjectConnection projectConnection, int javaDebugPort) {
    HashMap<String, String> envVars = new HashMap<>();
    envVars.put("JAVA_TOOL_OPTIONS",
        String.format("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=%d", javaDebugPort));
    return envVars;
  }

  public static void cancelGetBuilds(StreamObserver<CancelGetBuildsReply> responseObserver) {
    Map<String, CancellationTokenSource> pool =
        cancellationTokenPool.getPoolType(CancellationTokenPool.TYPE.GET);
    pool.keySet().stream().forEach(key -> pool.get(key).cancel());
    CancelGetBuildsReply reply =
        CancelGetBuildsReply.newBuilder().setMessage("Cancel get projects requested").build();
    responseObserver.onNext(reply);
  }

  public static void cancelRunTask(File projectDir, String task,
      StreamObserver<CancelRunTaskReply> responseObserver) {
    String cancellationKey = projectDir.getAbsolutePath() + task;
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
    gradleProject.getChildren().stream()
        .forEach(childGradleProject -> project.addProjects(buildProject(childGradleProject)));
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
