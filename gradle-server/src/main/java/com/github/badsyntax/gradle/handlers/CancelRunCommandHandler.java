package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelRunCommandReply;
import com.github.badsyntax.gradle.CancelRunCommandRequest;
import com.github.badsyntax.gradle.cancellation.CancellationHandler;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelRunCommandHandler {
  private static final Logger logger =
      LoggerFactory.getLogger(CancelRunCommandHandler.class.getName());

  private CancelRunCommandRequest req;
  private StreamObserver<CancelRunCommandReply> responseObserver;

  public CancelRunCommandHandler(
      CancelRunCommandRequest req, StreamObserver<CancelRunCommandReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    try {
      CancellationHandler.cancelRun(
          RunCommandHandler.getCancellationKey(req.getProjectDir(), req.getArgsList()));
      replyWithCancelledSuccess();
    } catch (GradleCancellationException e) {
      logger.error(e.getMessage());
      replyWithCancelError(e);
    } finally {
      responseObserver.onCompleted();
    }
  }

  private void replyWithCancelledSuccess() {
    responseObserver.onNext(
        CancelRunCommandReply.newBuilder()
            .setMessage("Cancel run command requested")
            .setCommandRunning(true)
            .build());
  }

  private void replyWithCancelError(Exception e) {
    responseObserver.onNext(
        CancelRunCommandReply.newBuilder()
            .setMessage(e.getMessage())
            .setCommandRunning(false)
            .build());
  }
}
