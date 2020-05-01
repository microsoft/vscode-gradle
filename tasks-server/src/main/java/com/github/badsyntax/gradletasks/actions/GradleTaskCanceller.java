package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.CancelRunTaskReply;
import com.github.badsyntax.gradletasks.CancelRunTaskRequest;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.github.badsyntax.gradletasks.exceptions.GradleCancellationException;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleTaskCanceller {
  private static final Logger logger = LoggerFactory.getLogger(GradleTaskCanceller.class.getName());

  private CancelRunTaskRequest req;
  private StreamObserver<CancelRunTaskReply> responseObserver;

  public GradleTaskCanceller(
      CancelRunTaskRequest req, StreamObserver<CancelRunTaskReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void cancelRunTask() {
    try {
      CancellationHandler.cancelRunTask(
          GradleTaskRunner.getCancellationKey(req.getProjectDir(), req.getTask()));
      replyWithCancelledSuccess();
    } catch (GradleCancellationException e) {
      logger.error(e.getMessage());
      replyWithCancelError(e);
    }
  }

  private void replyWithCancelledSuccess() {
    System.out.println("REPLY WITH CANCEL SUCCESS");
    responseObserver.onNext(
        CancelRunTaskReply.newBuilder()
            .setMessage("Cancel run task requested")
            .setTaskRunning(true)
            .build());
  }

  private void replyWithCancelError(Exception e) {
    System.out.println("REPLY WITH CANCEL ERROR");
    responseObserver.onNext(
        CancelRunTaskReply.newBuilder()
            .setMessage("Task is not running")
            .setTaskRunning(false)
            .build());
  }
}
