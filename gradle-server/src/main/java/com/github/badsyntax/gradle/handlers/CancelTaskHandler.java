package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelRunTaskReply;
import com.github.badsyntax.gradle.CancelRunTaskRequest;
import com.github.badsyntax.gradle.cancellation.CancellationHandler;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelTaskHandler {
  private static final Logger logger = LoggerFactory.getLogger(CancelTaskHandler.class.getName());

  private CancelRunTaskRequest req;
  private StreamObserver<CancelRunTaskReply> responseObserver;

  public CancelTaskHandler(
      CancelRunTaskRequest req, StreamObserver<CancelRunTaskReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    try {
      CancellationHandler.cancelRunTask(
          RunTaskHandler.getCancellationKey(req.getProjectDir(), req.getTask()));
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
        CancelRunTaskReply.newBuilder()
            .setMessage("Cancel run task requested")
            .setTaskRunning(true)
            .build());
  }

  private void replyWithCancelError(Exception e) {
    responseObserver.onNext(
        CancelRunTaskReply.newBuilder().setMessage(e.getMessage()).setTaskRunning(false).build());
  }
}
