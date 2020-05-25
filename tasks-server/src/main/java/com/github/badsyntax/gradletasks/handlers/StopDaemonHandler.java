package com.github.badsyntax.gradletasks.handlers;

import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.StopDaemonReply;
import com.github.badsyntax.gradletasks.StopDaemonRequest;
import com.github.badsyntax.gradletasks.process.Process;
import io.grpc.stub.StreamObserver;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class StopDaemonHandler {
  private static final Logger logger = LoggerFactory.getLogger(StopDaemonHandler.class.getName());

  private StopDaemonRequest req;
  private StreamObserver<StopDaemonReply> responseObserver;

  public StopDaemonHandler(
      StopDaemonRequest req, StreamObserver<StopDaemonReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    try {
      Process.kill(req.getPid());
      replyWithSuccess(String.format("Killed daemon with PID %s", req.getPid()));
    } catch (IOException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    }
  }

  public void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  public void replyWithSuccess(String message) {
    responseObserver.onNext(StopDaemonReply.newBuilder().setMessage(message).build());
    responseObserver.onCompleted();
  }
}
