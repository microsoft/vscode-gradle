package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.CancelRunTaskReply;
import com.github.badsyntax.gradletasks.CancelRunTaskRequest;
import com.github.badsyntax.gradletasks.Logger;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.github.badsyntax.gradletasks.exceptions.GradleCancellationException;
import io.grpc.stub.StreamObserver;

public class GradleTaskCanceller {
  private static final Logger logger = Logger.getLogger(GradleTaskCanceller.class);

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
