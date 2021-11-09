package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ByteBufferOutputStream;
import com.github.badsyntax.gradle.Cancelled;
import com.github.badsyntax.gradle.Environment;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GetBuildReply;
import com.github.badsyntax.gradle.GetBuildRequest;
import com.github.badsyntax.gradle.GetBuildResult;
import com.github.badsyntax.gradle.GradleBuild;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.GradleEnvironment;
import com.github.badsyntax.gradle.GradleProject;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.GradleTask;
import com.github.badsyntax.gradle.JavaEnvironment;
import com.github.badsyntax.gradle.Output;
import com.github.badsyntax.gradle.Progress;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.google.common.base.Strings;
import com.google.protobuf.ByteString;
import io.github.g00fy2.versioncompare.Version;
import io.grpc.stub.StreamObserver;
import java.io.IOException;
import java.util.HashSet;
import java.util.Set;
import org.gradle.internal.service.ServiceCreationException;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.events.OperationType;
import org.gradle.tooling.events.ProgressEvent;
import org.gradle.tooling.events.ProgressListener;
import org.gradle.tooling.model.build.BuildEnvironment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GetBuildHandler {
  private static final Logger logger = LoggerFactory.getLogger(GetBuildHandler.class.getName());

  private GetBuildRequest req;
  private StreamObserver<GetBuildReply> responseObserver;
  private ProgressListener progressListener;
  private ByteBufferOutputStream standardOutputListener;
  private ByteBufferOutputStream standardErrorListener;
  private Environment environment;

  public GetBuildHandler(GetBuildRequest req, StreamObserver<GetBuildReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
    this.progressListener =
        (ProgressEvent event) -> {
          synchronized (GetBuildHandler.class) {
            replyWithProgress(event);
          }
        };
    this.standardOutputListener =
        new ByteBufferOutputStream() {
          @Override
          public void onFlush(byte[] bytes) {
            synchronized (GetBuildHandler.class) {
              replyWithStandardOutput(bytes);
            }
          }
        };
    this.standardErrorListener =
        new ByteBufferOutputStream() {
          @Override
          public void onFlush(byte[] bytes) {
            synchronized (GetBuildHandler.class) {
              replyWithStandardError(bytes);
            }
          }
        };
  }

  public void run() {
    GradleConnector gradleConnector;
    try {
      gradleConnector = GradleProjectConnector.build(req.getProjectDir(), req.getGradleConfig());
    } catch (GradleConnectionException e) {
      logger.error(e.getMessage());
      responseObserver.onError(ErrorMessageBuilder.build(e));
      return;
    }

    try (ProjectConnection connection = gradleConnector.connect()) {
      this.environment = buildEnvironment(connection);
      replyWithBuildEnvironment(this.environment);
      org.gradle.tooling.model.GradleProject gradleProject = getGradleProject(connection);
      replyWithProject(getProjectData(gradleProject, gradleProject));
    } catch (BuildCancelledException e) {
      replyWithCancelled(e);
    } catch (ServiceCreationException
        | IOException
        | IllegalStateException
        | org.gradle.tooling.GradleConnectionException e) {
      if (this.environment != null) {
        String gradleVersion = this.environment.getGradleEnvironment().getGradleVersion();
        String javaVersion = System.getProperty("java.version");
        Version highestJDKVersion = getHighestJDKVersion(gradleVersion);
        if (highestJDKVersion.isLowerThan(javaVersion)) {
          replyWithCompatibilityCheckError(
              gradleVersion, javaVersion, highestJDKVersion.getMajor());
        }
      } else {
        String rootCause = getRootCause(e);
        if (rootCause.contains("Could not determine java version")) {
          // Current Gradle version requires no more than Java 8.
          // Since the language server requires JDK11+,
          // We recommend the user to change gradle settings
          replyWithCompatibilityCheckError();
        }
      }
      logger.error(e.getMessage());
      replyWithError(e);
    } finally {
      GradleBuildCancellation.clearToken(req.getCancellationKey());
    }
  }

  private String getRootCause(Throwable error) {
    Throwable rootCause = error;
    while (true) {
      Throwable cause = rootCause.getCause();
      if (cause == null || cause.getMessage() == null && !(cause instanceof StackOverflowError)) {
        break;
      }
      rootCause = cause;
    }
    return rootCause.toString();
  }

  private Version getHighestJDKVersion(String gradleVersion) {
    // Ref: https://docs.gradle.org/current/userguide/compatibility.html
    Version gradleVer = new Version(gradleVersion);
    if (gradleVer.isAtLeast("7.3.0", /* ignoreSuffix */ true)) {
      // See: https://docs.gradle.org/7.3-rc-3/release-notes.html#java17
      return new Version("17");
    } else if (gradleVer.isAtLeast("7.0")) {
      return new Version("16");
    } else if (gradleVer.isAtLeast("6.7")) {
      return new Version("15");
    } else if (gradleVer.isAtLeast("6.3")) {
      return new Version("14");
    } else if (gradleVer.isAtLeast("6.0")) {
      return new Version("13");
    } else if (gradleVer.isAtLeast("5.4")) {
      return new Version("12");
    } else if (gradleVer.isAtLeast("5.0")) {
      return new Version("11");
    } else if (gradleVer.isAtLeast("4.7")) {
      return new Version("10");
    } else if (gradleVer.isAtLeast("4.3")) {
      return new Version("9");
    } else if (gradleVer.isAtLeast("2.0")) {
      return new Version("1.8");
    }
    return new Version("1.7");
  }

  private Environment buildEnvironment(ProjectConnection connection) {
    ModelBuilder<BuildEnvironment> buildEnvironment = connection.model(BuildEnvironment.class);

    Set<OperationType> progressEvents = new HashSet<>();
    progressEvents.add(OperationType.GENERIC);

    CancellationToken cancellationToken =
        GradleBuildCancellation.buildToken(req.getCancellationKey());

    buildEnvironment
        .withCancellationToken(cancellationToken)
        .addProgressListener(progressListener, progressEvents)
        .setStandardOutput(standardOutputListener)
        .setStandardError(standardErrorListener);
    String jvmArguments = req.getGradleConfig().getJvmArguments();
    if (!Strings.isNullOrEmpty(jvmArguments)) {
      buildEnvironment.setJvmArguments(jvmArguments.split(" "));
    }

    try {
      BuildEnvironment environment = buildEnvironment.get();
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
    } finally {
      GradleBuildCancellation.clearToken(req.getCancellationKey());
    }
  }

  private org.gradle.tooling.model.GradleProject getGradleProject(ProjectConnection connection)
      throws IOException {

    ModelBuilder<org.gradle.tooling.model.GradleProject> projectBuilder =
        connection.model(org.gradle.tooling.model.GradleProject.class);

    Set<OperationType> progressEvents = new HashSet<>();
    progressEvents.add(OperationType.PROJECT_CONFIGURATION);

    CancellationToken cancellationToken =
        GradleBuildCancellation.buildToken(req.getCancellationKey());

    projectBuilder
        .withCancellationToken(cancellationToken)
        .addProgressListener(progressListener, progressEvents)
        .setStandardOutput(standardOutputListener)
        .setStandardError(standardErrorListener)
        .setColorOutput(req.getShowOutputColors());
    String jvmArguments = req.getGradleConfig().getJvmArguments();
    if (!Strings.isNullOrEmpty(jvmArguments)) {
      projectBuilder.setJvmArguments(jvmArguments.split(" "));
    }

    try {
      return projectBuilder.get();
    } finally {
      GradleBuildCancellation.clearToken(req.getCancellationKey());
    }
  }

  private GradleProject getProjectData(
      org.gradle.tooling.model.GradleProject gradleProject,
      org.gradle.tooling.model.GradleProject rootGradleProject) {
    GradleProject.Builder project =
        GradleProject.newBuilder().setIsRoot(gradleProject.getParent() == null);
    gradleProject.getChildren().stream()
        .forEach(
            childGradleProject ->
                project.addProjects(getProjectData(childGradleProject, rootGradleProject)));
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
                      .setRootProject(rootGradleProject.getName());
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

  private void replyWithProject(GradleProject gradleProject) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setGetBuildResult(
                GetBuildResult.newBuilder()
                    .setBuild(GradleBuild.newBuilder().setProject(gradleProject)))
            .build());
    responseObserver.onCompleted();
  }

  private void replyWithCancelled(BuildCancelledException e) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setCancelled(
                Cancelled.newBuilder()
                    .setMessage(e.getMessage())
                    .setProjectDir(req.getProjectDir()))
            .build());
    responseObserver.onCompleted();
  }

  private void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  private void replyWithBuildEnvironment(Environment environment) {
    responseObserver.onNext(GetBuildReply.newBuilder().setEnvironment(environment).build());
  }

  private void replyWithProgress(ProgressEvent progressEvent) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setProgress(Progress.newBuilder().setMessage(progressEvent.getDisplayName()))
            .build());
  }

  private void replyWithStandardOutput(byte[] bytes) {
    ByteString byteString = ByteString.copyFrom(bytes);
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDOUT)
                    .setOutputBytes(byteString))
            .build());
  }

  private void replyWithStandardError(byte[] bytes) {
    ByteString byteString = ByteString.copyFrom(bytes);
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDERR)
                    .setOutputBytes(byteString))
            .build());
  }

  private void replyWithCompatibilityCheckError(
      String gradleVersion, String javaVersion, int jdkMajorVersion) {
    String errorMessage =
        "Could not use Gradle version "
            + gradleVersion
            + " and Java version "
            + javaVersion
            + " to configure the build. Please consider either to change your Java Runtime to no higher than Java "
            + jdkMajorVersion
            + " or to change your Gradle settings.";
    responseObserver.onNext(
        GetBuildReply.newBuilder().setCompatibilityCheckError(errorMessage).build());
  }

  private void replyWithCompatibilityCheckError() {
    String errorMessage =
        "The current Gradle version requires Java 8 or lower. Please consider to change your Gradle settings.";
    responseObserver.onNext(
        GetBuildReply.newBuilder().setCompatibilityCheckError(errorMessage).build());
  }
}
