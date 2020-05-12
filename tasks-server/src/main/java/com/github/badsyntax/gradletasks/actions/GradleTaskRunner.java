package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.ByteBufferOutputStream;
import com.github.badsyntax.gradletasks.Cancelled;
import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.Output;
import com.github.badsyntax.gradletasks.Progress;
import com.github.badsyntax.gradletasks.RunTaskReply;
import com.github.badsyntax.gradletasks.RunTaskRequest;
import com.github.badsyntax.gradletasks.RunTaskResult;
import com.github.badsyntax.gradletasks.StringBufferOutputStream;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.github.badsyntax.gradletasks.exceptions.GradleTaskRunnerException;
import com.google.common.base.Strings;
import com.google.protobuf.ByteString;
import io.grpc.stub.StreamObserver;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
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

public class GradleTaskRunner {
  private static final Logger logger = LoggerFactory.getLogger(GradleTaskRunner.class.getName());
  private static final String JAVA_TOOL_OPTIONS_ENV = "JAVA_TOOL_OPTIONS";

  private RunTaskRequest req;
  private StreamObserver<RunTaskReply> responseObserver;
  private GradleConnector gradleConnector;

  public GradleTaskRunner(
      RunTaskRequest req,
      StreamObserver<RunTaskReply> responseObserver,
      GradleConnector gradleConnector) {
    this.req = req;
    this.responseObserver = responseObserver;
    this.gradleConnector = gradleConnector;
  }

  public static String getCancellationKey(String projectDir, String task) {
    return projectDir + task;
  }

  public String getCancellationKey() {
    return GradleTaskRunner.getCancellationKey(req.getProjectDir(), req.getTask());
  }

  public void run() {
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
        new ProgressListener() {
          @Override
          public void statusChanged(ProgressEvent event) {
            synchronized (GradleTaskRunner.class) {
              replyWithProgress(event);
            }
          }
        };

    BuildLauncher build =
        connection
            .newBuild()
            .withCancellationToken(
                CancellationHandler.getRunTaskCancellationToken(getCancellationKey()))
            .addProgressListener(progressListener, progressEvents)
            .setColorOutput(req.getShowOutputColors())
            .withArguments(req.getArgsList())
            .forTasks(req.getTask());

    OutputStream standardOutputListener =
        req.getOutputStream() == RunTaskRequest.OutputStream.STRING
            ? new StringBufferOutputStream() {
              @Override
              public void onFlush(String output) {
                synchronized (GradleTaskRunner.class) {
                  replyWithStandardOutput(output);
                }
              }
            }
            : new ByteBufferOutputStream() {
              @Override
              public void onFlush(ByteArrayOutputStream outputStream) {
                synchronized (GradleTaskRunner.class) {
                  replyWithStandardOutput(outputStream);
                }
              }
            };
    OutputStream standardErrorListener =
        req.getOutputStream() == RunTaskRequest.OutputStream.STRING
            ? new StringBufferOutputStream() {
              @Override
              public void onFlush(String output) {
                synchronized (GradleTaskRunner.class) {
                  replyWithStandardError(output);
                }
              }
            }
            : new ByteBufferOutputStream() {
              @Override
              public void onFlush(ByteArrayOutputStream outputStream) {
                synchronized (GradleTaskRunner.class) {
                  replyWithStandardError(outputStream);
                }
              }
            };

    build.setStandardOutput(standardOutputListener);
    build.setStandardError(standardErrorListener);

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

    try {
      build.run();
    } finally {
      standardOutputListener.close();
      standardErrorListener.close();
    }
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

  private void replyWithStandardOutput(ByteArrayOutputStream outputStream) {
    ByteString byteString = ByteString.copyFrom(outputStream.toByteArray());
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDOUT)
                    .setOutputBytes(byteString))
            .build());
  }

  private void replyWithStandardError(ByteArrayOutputStream outputStream) {
    ByteString byteString = ByteString.copyFrom(outputStream.toByteArray());
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDERR)
                    .setOutputBytes(byteString))
            .build());
  }

  private void replyWithStandardOutput(String message) {
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDOUT)
                    .setOutputString(message))
            .build());
  }

  private void replyWithStandardError(String message) {
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDERR)
                    .setOutputString(message))
            .build());
  }
}
