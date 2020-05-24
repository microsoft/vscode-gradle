package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.GradleWrapperExecutor;
import com.github.badsyntax.gradletasks.StopDaemonsReply;
import com.github.badsyntax.gradletasks.StopDaemonsRequest;
import com.github.badsyntax.gradletasks.exceptions.GradleWrapperException;
import io.grpc.stub.StreamObserver;
import java.io.BufferedReader;
import java.io.File;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleDaemonsStopper {
  private static final Logger logger =
      LoggerFactory.getLogger(GradleDaemonsStopper.class.getName());

  private StopDaemonsRequest req;
  private StreamObserver<StopDaemonsReply> responseObserver;

  public GradleDaemonsStopper(
      StopDaemonsRequest req, StreamObserver<StopDaemonsReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    File projectRoot = new File(req.getProjectDir());
    try {
      GradleWrapperExecutor gradleWrapper = new GradleWrapperExecutor(projectRoot);
      BufferedReader stopOutput = gradleWrapper.exec("--stop");
      String message = stopOutput.lines().collect(Collectors.joining("\n"));
      replyWithSuccess(message);
    } catch (GradleWrapperException e) {
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
    responseObserver.onNext(StopDaemonsReply.newBuilder().setMessage(message).build());
  }
}
