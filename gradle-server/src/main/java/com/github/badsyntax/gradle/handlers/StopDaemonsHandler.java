package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GradleWrapper;
import com.github.badsyntax.gradle.StopDaemonsReply;
import com.github.badsyntax.gradle.StopDaemonsRequest;
import com.github.badsyntax.gradle.exceptions.GradleWrapperException;
import io.grpc.stub.StreamObserver;
import java.io.File;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class StopDaemonsHandler {
  private static final Logger logger = LoggerFactory.getLogger(StopDaemonsHandler.class.getName());

  private StopDaemonsRequest req;
  private StreamObserver<StopDaemonsReply> responseObserver;

  public StopDaemonsHandler(
      StopDaemonsRequest req, StreamObserver<StopDaemonsReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    File projectRoot = new File(req.getProjectDir());
    try {
      GradleWrapper gradleWrapper = new GradleWrapper(projectRoot);
      String stopOutput = gradleWrapper.exec("--stop");
      replyWithSuccess(stopOutput);
      responseObserver.onCompleted();
    } catch (GradleWrapperException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    }
  }

  private void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  private void replyWithSuccess(String message) {
    responseObserver.onNext(StopDaemonsReply.newBuilder().setMessage(message).build());
  }
}
