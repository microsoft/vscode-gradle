package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.StopDaemonReply;
import com.github.badsyntax.gradletasks.StopDaemonRequest;
import io.grpc.stub.StreamObserver;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleSingleDaemonStopper {
  private static final Logger logger =
      LoggerFactory.getLogger(GradleSingleDaemonStopper.class.getName());

  private StopDaemonRequest req;
  private StreamObserver<StopDaemonReply> responseObserver;

  public GradleSingleDaemonStopper(
      StopDaemonRequest req, StreamObserver<StopDaemonReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    Boolean isWindows = System.getProperty("os.name").toLowerCase().contains("windows");
    Runtime runtime = Runtime.getRuntime();
    try {
      if (isWindows) {
        runtime.exec(String.format("taskkill %s", req.getPid()));
      } else {
        runtime.exec(String.format("kill -9 %s", req.getPid()));
      }
      replyWithSuccess(String.format("Killed daemon with PID %s", req.getPid()));
    } catch (IOException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    } finally {
      responseObserver.onCompleted();
    }
  }

  public void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  public void replyWithSuccess(String message) {
    responseObserver.onNext(StopDaemonReply.newBuilder().setMessage(message).build());
  }
}
