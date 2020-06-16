package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ByteBufferOutputStream;
import com.github.badsyntax.gradle.Cancelled;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.Output;
import com.github.badsyntax.gradle.Progress;
import com.github.badsyntax.gradle.RunTaskReply;
import com.github.badsyntax.gradle.RunTaskRequest;
import com.github.badsyntax.gradle.RunTaskResult;
import com.github.badsyntax.gradle.cancellation.CancellationHandler;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.github.badsyntax.gradle.exceptions.GradleTaskRunnerException;
import com.google.common.base.Strings;
import com.google.protobuf.ByteString;
import io.grpc.stub.StreamObserver;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.UnsupportedVersionException;
import org.gradle.tooling.events.OperationType;
import org.gradle.tooling.events.ProgressEvent;
import org.gradle.tooling.events.ProgressListener;
import org.gradle.tooling.exceptions.UnsupportedBuildArgumentException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RunTaskHandler {
  private static final Logger logger = LoggerFactory.getLogger(RunTaskHandler.class.getName());
  private static final String JAVA_TOOL_OPTIONS_ENV = "JAVA_TOOL_OPTIONS";

  private RunTaskRequest req;
  private StreamObserver<RunTaskReply> responseObserver;

  public RunTaskHandler(RunTaskRequest req, StreamObserver<RunTaskReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public static String getCancellationKey(String projectDir, String task) {
    return projectDir + task;
  }

  public String getCancellationKey() {
    return RunTaskHandler.getCancellationKey(req.getProjectDir(), req.getTask());
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
      runTask(connection);
      replyWithSuccess();
      responseObserver.onCompleted();
    } catch (BuildCancelledException e) {
      replyWithCancelled(e);
      responseObserver.onCompleted();
    } catch (BuildException
        | UnsupportedVersionException
        | UnsupportedBuildArgumentException
        | IllegalStateException
        | IOException
        | GradleTaskRunnerException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    } finally {
      CancellationHandler.clearRunTaskToken(getCancellationKey());
    }
  }

  public void runTask(ProjectConnection connection) throws GradleTaskRunnerException, IOException {
    Set<OperationType> progressEvents = new HashSet<>();
    progressEvents.add(OperationType.PROJECT_CONFIGURATION);
    progressEvents.add(OperationType.TASK);
    progressEvents.add(OperationType.TRANSFORM);

    ProgressListener progressListener =
        (ProgressEvent event) -> {
          synchronized (RunTaskHandler.class) {
            replyWithProgress(event);
          }
        };

    // Specifying the tasks to run via build arguments provides support for task *and* build
    // arguments.
    // Using BuildLauncher.forTasks() prevents us from specifying task args.
    ArrayList<String> argsList = new ArrayList<String>(req.getArgsList());
    argsList.add(0, req.getTask());

    BuildLauncher build =
        connection
            .newBuild()
            .withCancellationToken(
                CancellationHandler.getRunTaskCancellationToken(getCancellationKey()))
            .addProgressListener(progressListener, progressEvents)
            .setStandardOutput(
                new ByteBufferOutputStream() {
                  @Override
                  public void onFlush(byte[] bytes) {
                    synchronized (RunTaskHandler.class) {
                      replyWithStandardOutput(bytes);
                    }
                  }
                })
            .setStandardError(
                new ByteBufferOutputStream() {
                  @Override
                  public void onFlush(byte[] bytes) {
                    synchronized (RunTaskHandler.class) {
                      replyWithStandardError(bytes);
                    }
                  }
                })
            .setColorOutput(req.getShowOutputColors())
            .withArguments(argsList);

    if (!Strings.isNullOrEmpty(req.getInput())) {
      InputStream inputStream = new ByteArrayInputStream(req.getInput().getBytes());
      build.setStandardInput(inputStream);
    }

    if (Boolean.TRUE.equals(req.getJavaDebug())) {
      if (req.getJavaDebugPort() == 0) {
        throw new GradleTaskRunnerException("Java debug port is not set");
      }
      build.setEnvironmentVariables(buildJavaEnvVarsWithJwdp(req.getJavaDebugPort()));
    }

    if (!Strings.isNullOrEmpty(req.getGradleConfig().getJvmArguments())) {
      build.setJvmArguments(req.getGradleConfig().getJvmArguments());
    }

    build.run();
  }

  private static Map<String, String> buildJavaEnvVarsWithJwdp(int javaDebugPort) {
    HashMap<String, String> envVars = new HashMap<>(System.getenv());
    envVars.put(
        JAVA_TOOL_OPTIONS_ENV,
        String.format(
            "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:%d",
            javaDebugPort));
    return envVars;
  }

  public void replyWithCancelled(BuildCancelledException e) {
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setCancelled(
                Cancelled.newBuilder()
                    .setMessage(e.getMessage())
                    .setProjectDir(req.getProjectDir()))
            .build());
  }

  public void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  public void replyWithSuccess() {
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setRunTaskResult(
                RunTaskResult.newBuilder()
                    .setMessage("Successfully run task")
                    .setTask(req.getTask()))
            .build());
  }

  private void replyWithProgress(ProgressEvent progressEvent) {
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setProgress(Progress.newBuilder().setMessage(progressEvent.getDisplayName()))
            .build());
  }

  private void replyWithStandardOutput(byte[] bytes) {
    ByteString byteString = ByteString.copyFrom(bytes);
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDOUT)
                    .setOutputBytes(byteString))
            .build());
  }

  private void replyWithStandardError(byte[] bytes) {
    ByteString byteString = ByteString.copyFrom(bytes);
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDERR)
                    .setOutputBytes(byteString))
            .build());
  }
}
