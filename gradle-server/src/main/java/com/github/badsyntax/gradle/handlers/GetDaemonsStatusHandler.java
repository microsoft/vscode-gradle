package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.DaemonInfo;
import com.github.badsyntax.gradle.DaemonStatus;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GetDaemonsStatusReply;
import com.github.badsyntax.gradle.GetDaemonsStatusRequest;
import com.github.badsyntax.gradle.GradleWrapper;
import com.github.badsyntax.gradle.exceptions.GradleWrapperException;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GetDaemonsStatusHandler {
  private static final Logger logger =
      LoggerFactory.getLogger(GetDaemonsStatusHandler.class.getName());

  private GetDaemonsStatusRequest req;
  private StreamObserver<GetDaemonsStatusReply> responseObserver;

  public GetDaemonsStatusHandler(
      GetDaemonsStatusRequest req, StreamObserver<GetDaemonsStatusReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public synchronized void run() {
    File projectRoot = new File(req.getProjectDir());
    GradleWrapper gradleWrapper = new GradleWrapper(projectRoot);
    DaemonStatus daemonStatus = new DaemonStatus(gradleWrapper);
    try {
      ArrayList<DaemonInfo> status = daemonStatus.get();
      replyWithSuccess(status);
    } catch (GradleWrapperException e) {
      logger.error(e.getMessage());
      replyWithError(e);
    }
  }

  public void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  public void replyWithSuccess(List<DaemonInfo> status) {
    responseObserver.onNext(GetDaemonsStatusReply.newBuilder().addAllDaemonInfo(status).build());
    responseObserver.onCompleted();
  }
}
