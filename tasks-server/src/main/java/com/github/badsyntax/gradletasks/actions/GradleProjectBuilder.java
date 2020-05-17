package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.ByteBufferOutputStream;
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
import com.github.badsyntax.gradletasks.VsCodeProject;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.github.badsyntax.gradletasks.exceptions.GradleProjectBuilderException;
import com.google.common.base.Strings;
import com.google.protobuf.ByteString;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashSet;
import java.util.Scanner;
import java.util.Set;
import org.gradle.internal.service.ServiceCreationException;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.UnsupportedVersionException;
import org.gradle.tooling.events.OperationType;
import org.gradle.tooling.events.ProgressEvent;
import org.gradle.tooling.events.ProgressListener;
import org.gradle.tooling.exceptions.UnsupportedBuildArgumentException;
import org.gradle.tooling.model.build.BuildEnvironment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import task.metadata.VsCodeProjectModel;

public class GradleProjectBuilder {
  private static final Logger logger =
      LoggerFactory.getLogger(GradleProjectBuilder.class.getName());

  private GetBuildRequest req;
  private StreamObserver<GetBuildReply> responseObserver;
  private GradleConnector gradleConnector;
  private String pluginPath;

  public GradleProjectBuilder(
      GetBuildRequest req,
      StreamObserver<GetBuildReply> responseObserver,
      GradleConnector gradleConnector,
      String pluginPath) {
    this.req = req;
    this.responseObserver = responseObserver;
    this.gradleConnector = gradleConnector;
    this.pluginPath = pluginPath;
  }

  public static String getCancellationKey(String projectDir) {
    return projectDir;
  }

  public String getCancellationKey() {
    return GradleProjectBuilder.getCancellationKey(req.getProjectDir());
  }

  private File createInitScriptFile() throws GradleProjectBuilderException {
    File tempFile;
    try {
      tempFile = File.createTempFile("init", ".gradle");
      String initScriptTemplate = getInitScriptTemplate();
      String absolutePluginPath = new File(pluginPath).getCanonicalPath();
      String initScript = initScriptTemplate.replace("PLUGIN_PATH", absolutePluginPath);
      Files.write(tempFile.toPath(), initScript.getBytes());
      return tempFile;
    } catch (IOException e) {
      throw new GradleProjectBuilderException("Unable to create temporary init script", e);
    }
  }

  public void build() {
    File initScript = null;
    try (ProjectConnection connection = gradleConnector.connect()) {
      initScript = createInitScriptFile();
      Environment environment = buildEnvironment(connection);
      replyWithBuildEnvironment(environment);
      org.gradle.tooling.model.GradleProject gradleProject = buildGradleProject(connection);
      GradleProject projectData = getProjectData(gradleProject);
      VsCodeProjectModel vscodeProject = getVscodeProject(connection, initScript);
      replyWithProject(projectData, vscodeProject);
    } catch (BuildCancelledException e) {
      replyWithCancelled(e);
    } catch (BuildException
        | ServiceCreationException
        | UnsupportedVersionException
        | UnsupportedBuildArgumentException
        | IOException
        | IllegalStateException
        | GradleProjectBuilderException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    } finally {
      if (initScript != null) {
        initScript.delete();
      }
      CancellationHandler.clearBuildToken(getCancellationKey());
    }
  }

  private org.gradle.tooling.model.GradleProject buildGradleProject(ProjectConnection connection)
      throws IOException, GradleProjectBuilderException {

    ModelBuilder<org.gradle.tooling.model.GradleProject> projectBuilder =
        connection.model(org.gradle.tooling.model.GradleProject.class);

    Set<OperationType> progressEvents = new HashSet<>();
    progressEvents.add(OperationType.PROJECT_CONFIGURATION);
    progressEvents.add(OperationType.TASK);

    ProgressListener progressListener =
        (ProgressEvent event) -> {
          synchronized (GradleProjectBuilder.class) {
            replyWithProgress(event);
          }
        };
    projectBuilder
        .withCancellationToken(CancellationHandler.getBuildCancellationToken(getCancellationKey()))
        .addProgressListener(progressListener, progressEvents)
        .setStandardOutput(
            new ByteBufferOutputStream() {
              @Override
              public void onFlush(byte[] bytes) {
                synchronized (GradleProjectBuilder.class) {
                  replyWithStandardOutput(bytes);
                }
              }
            })
        .setStandardError(
            new ByteBufferOutputStream() {
              @Override
              public void onFlush(byte[] bytes) {
                synchronized (GradleProjectBuilder.class) {
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

  private VsCodeProjectModel getVscodeProject(ProjectConnection connection, File initScript) {
    ModelBuilder<VsCodeProjectModel> customModelBuilder =
        connection.model(VsCodeProjectModel.class);
    customModelBuilder.withArguments("--init-script", initScript.getAbsolutePath());
    return customModelBuilder.get();
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

  public void replyWithProject(GradleProject gradleProject, VsCodeProjectModel vscodeProject) {
    responseObserver.onNext(
        GetBuildReply.newBuilder()
            .setGetBuildResult(
                GetBuildResult.newBuilder()
                    .setBuild(GradleBuild.newBuilder().setProject(gradleProject))
                    .setVsCodeProject(
                        VsCodeProject.newBuilder().addAllDebugTasks(vscodeProject.getDebugTasks())))
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

  private String getInitScriptTemplate() throws IOException, GradleProjectBuilderException {
    InputStream initFile =
        getClass().getClassLoader().getResourceAsStream("init-script/init.gradle.tpl");
    String text = null;
    try (Scanner scanner = new Scanner(initFile, StandardCharsets.UTF_8.name())) {
      text = scanner.useDelimiter("\\A").next();
    }
    return text;
  }
}
