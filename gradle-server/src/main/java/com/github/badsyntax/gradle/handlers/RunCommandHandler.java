package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ByteBufferOutputStream;
import com.github.badsyntax.gradle.Cancelled;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GradleRunner;
import com.github.badsyntax.gradle.Output;
import com.github.badsyntax.gradle.Progress;
import com.github.badsyntax.gradle.RunCommandReply;
import com.github.badsyntax.gradle.RunCommandRequest;
import com.github.badsyntax.gradle.RunCommandResult;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.github.badsyntax.gradle.exceptions.GradleTaskRunnerException;
import com.google.protobuf.ByteString;
import io.grpc.stub.StreamObserver;
import java.io.IOException;
import java.util.List;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.UnsupportedVersionException;
import org.gradle.tooling.events.ProgressEvent;
import org.gradle.tooling.exceptions.UnsupportedBuildArgumentException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RunCommandHandler {
  private static final Logger logger = LoggerFactory.getLogger(RunCommandHandler.class.getName());

  private RunCommandRequest req;
  private StreamObserver<RunCommandReply> responseObserver;

  public RunCommandHandler(
      RunCommandRequest req, StreamObserver<RunCommandReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public static String getCancellationKey(String projectDir, List<String> args) {
    return projectDir + String.join("", args);
  }

  public void run() {
    String cancellationKey = getCancellationKey(req.getProjectDir(), req.getArgsList());
    GradleRunner gradleRunner =
        new GradleRunner(
            req.getProjectDir(), req.getArgsList(), req.getGradleConfig(), cancellationKey);
    gradleRunner
        .setProgressListener(
            (ProgressEvent event) -> {
              synchronized (RunCommandHandler.class) {
                replyWithProgress(event);
              }
            })
        .setStandardOutputStream(
            new ByteBufferOutputStream() {
              @Override
              public void onFlush(byte[] bytes) {
                synchronized (RunCommandHandler.class) {
                  replyWithStandardOutput(bytes);
                }
              }
            })
        .setStandardErrorStream(
            new ByteBufferOutputStream() {
              @Override
              public void onFlush(byte[] bytes) {
                synchronized (RunCommandHandler.class) {
                  replyWithStandardError(bytes);
                }
              }
            });

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
        RunCommandReply.newBuilder()
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
        RunCommandReply.newBuilder()
            .setRunCommandResult(
                RunCommandResult.newBuilder().setMessage("Successfully run command"))
            .build());
  }

  private void replyWithProgress(ProgressEvent progressEvent) {
    responseObserver.onNext(
        RunCommandReply.newBuilder()
            .setProgress(Progress.newBuilder().setMessage(progressEvent.getDisplayName()))
            .build());
  }

  private void replyWithStandardOutput(byte[] bytes) {
    ByteString byteString = ByteString.copyFrom(bytes);
    responseObserver.onNext(
        RunCommandReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDOUT)
                    .setOutputBytes(byteString))
            .build());
  }

  private void replyWithStandardError(byte[] bytes) {
    ByteString byteString = ByteString.copyFrom(bytes);
    responseObserver.onNext(
        RunCommandReply.newBuilder()
            .setOutput(
                Output.newBuilder()
                    .setOutputType(Output.OutputType.STDERR)
                    .setOutputBytes(byteString))
            .build());
  }
}
