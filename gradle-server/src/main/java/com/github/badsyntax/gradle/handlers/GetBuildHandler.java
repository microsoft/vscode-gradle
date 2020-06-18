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
import io.grpc.stub.StreamObserver;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URISyntaxException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.CodeSource;
import java.util.HashSet;
import java.util.Set;
import org.gradle.demo.model.OutgoingArtifactsModel;
import org.gradle.demo.plugin.Beacon;
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

  public GetBuildHandler(GetBuildRequest req, StreamObserver<GetBuildReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
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
      replyWithBuildEnvironment(buildEnvironment(connection));

      ModelBuilder<OutgoingArtifactsModel> customModelBuilder =
          connection.model(OutgoingArtifactsModel.class);
      customModelBuilder.withArguments("--init-script", copyInitScript().getAbsolutePath());
      OutgoingArtifactsModel model = customModelBuilder.get();
      for (File artifact : model.getArtifacts()) {
        System.out.println("artifact = " + artifact);
      }

      org.gradle.tooling.model.GradleProject gradleProject = buildGradleProject(connection);
      replyWithProject(getProjectData(gradleProject, gradleProject));
    } catch (BuildCancelledException e) {
      replyWithCancelled(e);
    } catch (ServiceCreationException
        | IOException
        | IllegalStateException
        | URISyntaxException
        | org.gradle.tooling.GradleConnectionException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    } finally {
      GradleBuildCancellation.clearToken(req.getCancellationKey());
    }
  }

  private org.gradle.tooling.model.GradleProject buildGradleProject(ProjectConnection connection)
      throws IOException {

    ModelBuilder<org.gradle.tooling.model.GradleProject> projectBuilder =
        connection.model(org.gradle.tooling.model.GradleProject.class);

    Set<OperationType> progressEvents = new HashSet<>();
    progressEvents.add(OperationType.PROJECT_CONFIGURATION);
    progressEvents.add(OperationType.TASK);

    ProgressListener progressListener =
        (ProgressEvent event) -> {
          synchronized (GetBuildHandler.class) {
            replyWithProgress(event);
          }
        };

    CancellationToken cancellationToken =
        GradleBuildCancellation.buildToken(req.getCancellationKey());

    projectBuilder
        .withCancellationToken(cancellationToken)
        .addProgressListener(progressListener, progressEvents)
        .setStandardOutput(
            new ByteBufferOutputStream() {
              @Override
              public void onFlush(byte[] bytes) {
                synchronized (GetBuildHandler.class) {
                  replyWithStandardOutput(bytes);
                }
              }
            })
        .setStandardError(
            new ByteBufferOutputStream() {
              @Override
              public void onFlush(byte[] bytes) {
                synchronized (GetBuildHandler.class) {
                  replyWithStandardError(bytes);
                }
              }
            })
        .setColorOutput(req.getShowOutputColors());
    if (!Strings.isNullOrEmpty(req.getGradleConfig().getJvmArguments())) {
      projectBuilder.setJvmArguments(req.getGradleConfig().getJvmArguments());
    }

    return projectBuilder.get();
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

  private File copyInitScript() throws IOException, URISyntaxException {
    Path init = Files.createTempFile("init", ".gradle");
    StringBuilder sb = new StringBuilder();
    File pluginJar = lookupJar(Beacon.class);
    File modelJar = lookupJar(OutgoingArtifactsModel.class);
    try (BufferedReader reader =
        new BufferedReader(
            new InputStreamReader(
                getClass().getClassLoader().getResourceAsStream("init.gradle")))) {
      reader
          .lines()
          .forEach(
              line -> {
                String repl =
                    line.replace("%%PLUGIN_JAR%%", pluginJar.getAbsolutePath())
                        .replace("%%MODEL_JAR%%", modelJar.getAbsolutePath());
                sb.append(repl).append("\n");
              });
    }
    Files.copy(
        new ByteArrayInputStream(sb.toString().getBytes(Charset.defaultCharset())),
        init,
        StandardCopyOption.REPLACE_EXISTING);
    return init.toFile();
  }

  private static File lookupJar(Class<?> beaconClass) throws URISyntaxException {
    CodeSource codeSource = beaconClass.getProtectionDomain().getCodeSource();
    return new File(codeSource.getLocation().toURI());
  }

  // private static File findProjectPath(String... args) {
  //   if (args.length == 0) {
  //     return new File(".").getAbsoluteFile();
  //   }
  //   return new File(args[0]);
  // }

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
}
