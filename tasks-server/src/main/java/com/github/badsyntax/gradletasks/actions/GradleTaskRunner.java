package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.Cancelled;
import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.GradleOutputListener;
import com.github.badsyntax.gradletasks.Output;
import com.github.badsyntax.gradletasks.Progress;
import com.github.badsyntax.gradletasks.RunTaskReply;
import com.github.badsyntax.gradletasks.RunTaskRequest;
import com.github.badsyntax.gradletasks.RunTaskResult;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import io.grpc.stub.StreamObserver;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.Map;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProgressListener;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.UnsupportedVersionException;
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
      getTaskBuildLauncher(connection).run();
      replyWithSuccess();
    } catch (BuildCancelledException e) {
      replyWithCancelled(e);
    } catch (BuildException
        | UnsupportedVersionException
        | UnsupportedBuildArgumentException
        | IllegalStateException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    } finally {
      CancellationHandler.clearRunTaskToken(getCancellationKey());
    }
  }

  public BuildLauncher getTaskBuildLauncher(ProjectConnection connection) {
    BuildLauncher build =
        connection
            .newBuild()
            .withCancellationToken(
                CancellationHandler.getRunTaskCancellationToken(getCancellationKey()))
            .addProgressListener(buildProgressListener())
            .setStandardOutput(buildStandardOutputListener())
            .setStandardError(buildStandardErrorListener())
            .setColorOutput(true)
            .withArguments(req.getArgsList())
            .forTasks(req.getTask());
    if (Boolean.TRUE.equals(req.getJavaDebug())) {
      build.setEnvironmentVariables(buildJavaEnvVarsWithJwdp(req.getJavaDebugPort()));
    }
    return build;
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
            .setProgress(Progress.newBuilder().setMessage(progressEvent.getDescription()))
            .build());
  }

  private void replyWithStandardOutput(String message) {
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setOutput(
                Output.newBuilder().setOutputType(Output.OutputType.STDOUT).setMessage(message))
            .build());
  }

  private void replyWithStandardError(String message) {
    responseObserver.onNext(
        RunTaskReply.newBuilder()
            .setOutput(
                Output.newBuilder().setOutputType(Output.OutputType.STDERR).setMessage(message))
            .build());
  }
}
