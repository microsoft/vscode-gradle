package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ByteBufferOutputStream;
import com.github.badsyntax.gradle.Cancelled;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GradleRunner;
import com.github.badsyntax.gradle.Output;
import com.github.badsyntax.gradle.Progress;
import com.github.badsyntax.gradle.RunTaskReply;
import com.github.badsyntax.gradle.RunTaskRequest;
import com.github.badsyntax.gradle.RunTaskResult;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.github.badsyntax.gradle.exceptions.GradleTaskRunnerException;
import com.google.common.base.Strings;
import com.google.protobuf.ByteString;
import io.grpc.stub.StreamObserver;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.UnsupportedVersionException;
import org.gradle.tooling.events.ProgressEvent;
import org.gradle.tooling.exceptions.UnsupportedBuildArgumentException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RunTaskHandler {
  private static final Logger logger = LoggerFactory.getLogger(RunTaskHandler.class.getName());

  private RunTaskRequest req;
  private StreamObserver<RunTaskReply> responseObserver;

  public RunTaskHandler(RunTaskRequest req, StreamObserver<RunTaskReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public static String getCancellationKey(String projectDir, String task) {
    return projectDir + task;
  }

  public void run() {
    ArrayList<String> args = new ArrayList<>(req.getArgsList());
    args.add(0, req.getTask());
    String cancellationKey = getCancellationKey(req.getProjectDir(), req.getTask());
    GradleRunner gradleRunner =
        new GradleRunner(
            req.getProjectDir(),
            args,
            req.getGradleConfig(),
            cancellationKey,
            req.getShowOutputColors(),
            req.getJavaDebugPort());
    gradleRunner
        .setProgressListener(
            (ProgressEvent event) -> {
              synchronized (RunTaskHandler.class) {
                replyWithProgress(event);
              }
            })
        .setStandardOutputStream(
            new ByteBufferOutputStream() {
              @Override
              public void onFlush(byte[] bytes) {
                synchronized (RunTaskHandler.class) {
                  replyWithStandardOutput(bytes);
                }
              }
            })
        .setStandardErrorStream(
            new ByteBufferOutputStream() {
              @Override
              public void onFlush(byte[] bytes) {
                synchronized (RunTaskHandler.class) {
                  replyWithStandardError(bytes);
                }
              }
            });

    if (!Strings.isNullOrEmpty(req.getInput())) {
      gradleRunner.setStandardInputStream(new ByteArrayInputStream(req.getInput().getBytes()));
    }

    try {
      gradleRunner.run();
      replyWithSuccess();
      responseObserver.onCompleted();
    } catch (BuildCancelledException e) {
      replyWithCancelled(e);
      responseObserver.onCompleted();
    } catch (GradleConnectionException
        | BuildException
        | UnsupportedVersionException
        | UnsupportedBuildArgumentException
        | IllegalStateException
        | IOException
        | GradleTaskRunnerException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    }
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
