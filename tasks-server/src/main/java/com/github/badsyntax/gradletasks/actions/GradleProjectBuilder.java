package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.Cancelled;
import com.github.badsyntax.gradletasks.Environment;
import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.GetBuildReply;
import com.github.badsyntax.gradletasks.GetBuildRequest;
import com.github.badsyntax.gradletasks.GetBuildResult;
import com.github.badsyntax.gradletasks.GradleBuild;
import com.github.badsyntax.gradletasks.GradleEnvironment;
import com.github.badsyntax.gradletasks.GradleOutputListener;
import com.github.badsyntax.gradletasks.GradleProject;
import com.github.badsyntax.gradletasks.GradleTask;
import com.github.badsyntax.gradletasks.JavaEnvironment;
import com.github.badsyntax.gradletasks.Output;
import com.github.badsyntax.gradletasks.Progress;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.google.common.base.Strings;
import io.grpc.stub.StreamObserver;
import java.io.ByteArrayOutputStream;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProgressListener;
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
      ModelBuilder<org.gradle.tooling.model.GradleProject> projectBuilder =
          buildGradleProject(connection);
      replyWithGradleProject(buildProject(projectBuilder.get()));
    } catch (BuildCancelledException e) {
      replyWithCancelled(e);
    } catch (BuildException
        | UnsupportedVersionException
        | UnsupportedBuildArgumentException
        | IllegalStateException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    } finally {
      CancellationHandler.clearBuildToken(getCancellationKey());
    }
  }

  private ModelBuilder<org.gradle.tooling.model.GradleProject> buildGradleProject(
      ProjectConnection connection) {
    ModelBuilder<org.gradle.tooling.model.GradleProject> projectBuilder =
        connection.model(org.gradle.tooling.model.GradleProject.class);
    projectBuilder
        .withCancellationToken(CancellationHandler.getBuildCancellationToken(getCancellationKey()))
        .addProgressListener(buildProgressListener())
        .setStandardOutput(buildStandardOutputListener())
        .setStandardError(buildStandardErrorListener())
        .setColorOutput(false);
    if (!Strings.isNullOrEmpty(req.getGradleConfig().getJvmArguments())) {
      projectBuilder.setJvmArguments(req.getGradleConfig().getJvmArguments());
    }
    return projectBuilder;
  }

  private GradleProject buildProject(org.gradle.tooling.model.GradleProject gradleProject) {
    GradleProject.Builder project =
        GradleProject.newBuilder().setIsRoot(gradleProject.getParent() == null);
    gradleProject.getChildren().stream()
        .forEach(childGradleProject -> project.addProjects(buildProject(childGradleProject)));
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

  public ProgressListener buildProgressListener() {
    return (ProgressEvent progressEvent) -> {
      synchronized (this) {
        replyWithProgress(progressEvent);
      }
    };
  }

  public GradleOutputListener buildStandardOutputListener() {
    return new GradleOutputListener() {
      @Override
      public void onOutputChanged(ByteArrayOutputStream outputMessage) {
        synchronized (this) {
          replyWithStandardOutput(outputMessage.toString());
        }
      }
    };
  }

  public GradleOutputListener buildStandardErrorListener() {
    return new GradleOutputListener() {
      @Override
      public void onOutputChanged(ByteArrayOutputStream outputMessage) {
        synchronized (this) {
          replyWithStandardError(outputMessage.toString());
        }
      }
    };
  }

  public void replyWithGradleProject(GradleProject gradleProject) {
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

  private void replyWithStandardOutput(String message) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setOutput(
                Output.newBuilder().setOutputType(Output.OutputType.STDOUT).setMessage(message))
            .build());
  }

  private void replyWithStandardError(String message) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setOutput(
                Output.newBuilder().setOutputType(Output.OutputType.STDERR).setMessage(message))
            .build());
  }
}
