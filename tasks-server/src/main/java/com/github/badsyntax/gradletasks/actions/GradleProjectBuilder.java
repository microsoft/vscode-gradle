package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.Cancelled;
import com.github.badsyntax.gradletasks.Environment;
import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.GetBuildReply;
import com.github.badsyntax.gradletasks.GetBuildRequest;
import com.github.badsyntax.gradletasks.GetBuildResult;
import com.github.badsyntax.gradletasks.GradleBuild;
import com.github.badsyntax.gradletasks.GradleEnvironment;
import com.github.badsyntax.gradletasks.GradleProject;
import com.github.badsyntax.gradletasks.GradleTask;
import com.github.badsyntax.gradletasks.JavaEnvironment;
import com.github.badsyntax.gradletasks.Output;
import com.github.badsyntax.gradletasks.Progress;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.google.common.base.Strings;
import io.grpc.stub.StreamObserver;
import java.io.IOException;
import java.io.OutputStream;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.UnsupportedVersionException;
import org.gradle.tooling.exceptions.UnsupportedBuildArgumentException;
import org.gradle.tooling.model.build.BuildEnvironment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleProjectBuilder {
  private static final Logger logger =
      LoggerFactory.getLogger(GradleProjectBuilder.class.getName());

  private GetBuildRequest req;
  private StreamObserver<GetBuildReply> responseObserver;
  private GradleConnector gradleConnector;

  public GradleProjectBuilder(
      GetBuildRequest req,
      StreamObserver<GetBuildReply> responseObserver,
      GradleConnector gradleConnector) {
    this.req = req;
    this.responseObserver = responseObserver;
    this.gradleConnector = gradleConnector;
  }

  public static String getCancellationKey(String projectDir) {
    return projectDir;
  }

  public String getCancellationKey() {
    return GradleProjectBuilder.getCancellationKey(req.getProjectDir());
  }

  public void build() {
    try (ProjectConnection connection = gradleConnector.connect()) {
      replyWithBuildEnvironment(buildEnvironment(connection));
      org.gradle.tooling.model.GradleProject gradleProject = buildGradleProject(connection);
      replyWithProject(getProjectData(gradleProject));
    } catch (BuildCancelledException e) {
      replyWithCancelled(e);
    } catch (BuildException
        | UnsupportedVersionException
        | UnsupportedBuildArgumentException
        | IOException
        | IllegalStateException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    } finally {
      CancellationHandler.clearBuildToken(getCancellationKey());
    }
  }

  private org.gradle.tooling.model.GradleProject buildGradleProject(ProjectConnection connection)
      throws IOException {

    ModelBuilder<org.gradle.tooling.model.GradleProject> projectBuilder =
        connection.model(org.gradle.tooling.model.GradleProject.class);
    projectBuilder
        .withCancellationToken(CancellationHandler.getBuildCancellationToken(getCancellationKey()))
        .addProgressListener(
            (ProgressEvent progressEvent) -> {
              synchronized (GradleProjectBuilder.class) {
                replyWithProgress(progressEvent);
              }
            })
        .setStandardOutput(
            new OutputStream() {
              @Override
              public final void write(int b) throws IOException {
                synchronized (GradleTaskRunner.class) {
                  replyWithStandardOutput(b);
                }
              }
            })
        .setStandardError(
            new OutputStream() {
              @Override
              public final void write(int b) throws IOException {
                synchronized (GradleTaskRunner.class) {
                  replyWithStandardError(b);
                }
              }
            })
        .setColorOutput(req.getShowOutputColors());
    if (!Strings.isNullOrEmpty(req.getGradleConfig().getJvmArguments())) {
      projectBuilder.setJvmArguments(req.getGradleConfig().getJvmArguments());
    }

    org.gradle.tooling.model.GradleProject gradleProject = projectBuilder.get();

    return gradleProject;
  }

  private GradleProject getProjectData(org.gradle.tooling.model.GradleProject gradleProject) {
    GradleProject.Builder project =
        GradleProject.newBuilder().setIsRoot(gradleProject.getParent() == null);
    gradleProject.getChildren().stream()
        .forEach(childGradleProject -> project.addProjects(getProjectData(childGradleProject)));
    gradleProject.getTasks().stream()
        .forEach(
            task -> {
              GradleTask.Builder gradleTask =
                  GradleTask.newBuilder()
                      .setProject(task.getProject().getName())
                      .setName(task.getName())
                      .setPath(task.getPath())
                      .setBuildFile(
                          task.getProject().getBuildScript().getSourceFile().getAbsolutePath())
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

  private Environment buildEnvironment(ProjectConnection connection) {
    BuildEnvironment environment = connection.model(BuildEnvironment.class).get();
    org.gradle.tooling.model.build.GradleEnvironment gradleEnvironment = environment.getGradle();
    org.gradle.tooling.model.build.JavaEnvironment javaEnvironment = environment.getJava();
    return Environment.newBuilder()
        .setGradleEnvironment(
            GradleEnvironment.newBuilder()
                .setGradleUserHome(gradleEnvironment.getGradleUserHome().getAbsolutePath())
                .setGradleVersion(gradleEnvironment.getGradleVersion()))
        .setJavaEnvironment(
            JavaEnvironment.newBuilder()
                .setJavaHome(javaEnvironment.getJavaHome().getAbsolutePath())
                .addAllJvmArgs(javaEnvironment.getJvmArguments()))
        .build();
  }

  public void replyWithProject(GradleProject gradleProject) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setGetBuildResult(
                GetBuildResult.newBuilder()
                    .setBuild(GradleBuild.newBuilder().setProject(gradleProject)))
            .build());
    responseObserver.onCompleted();
  }

  public void replyWithCancelled(BuildCancelledException e) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setCancelled(
                Cancelled.newBuilder()
                    .setMessage(e.getMessage())
                    .setProjectDir(req.getProjectDir()))
            .build());
    responseObserver.onCompleted();
  }

  public void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  public void replyWithBuildEnvironment(Environment environment) {
    responseObserver.onNext(GetBuildReply.newBuilder().setEnvironment(environment).build());
  }

  private void replyWithProgress(ProgressEvent progressEvent) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setProgress(Progress.newBuilder().setMessage(progressEvent.getDescription()))
            .build());
  }

  private void replyWithStandardOutput(int b) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setOutput(
                Output.newBuilder().setOutputType(Output.OutputType.STDOUT).setMessageByte(b))
            .build());
  }

  private void replyWithStandardError(int b) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setOutput(
                Output.newBuilder().setOutputType(Output.OutputType.STDERR).setMessageByte(b))
            .build());
  }
}
