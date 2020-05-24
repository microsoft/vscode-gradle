package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.DaemonInfo;
import com.github.badsyntax.gradletasks.DaemonStatus;
import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.GetDaemonsStatusReply;
import com.github.badsyntax.gradletasks.GetDaemonsStatusRequest;
import com.github.badsyntax.gradletasks.GradleWrapperExecutor;
import com.github.badsyntax.gradletasks.exceptions.GradleWrapperException;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.util.ArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleDaemonsStatus {
  private static final Logger logger = LoggerFactory.getLogger(GradleDaemonsStatus.class.getName());

  private GetDaemonsStatusRequest req;
  private StreamObserver<GetDaemonsStatusReply> responseObserver;

  public GradleDaemonsStatus(
      GetDaemonsStatusRequest req, StreamObserver<GetDaemonsStatusReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    File projectRoot = new File(req.getProjectDir());
    GradleWrapperExecutor gradleWrapper = new GradleWrapperExecutor(projectRoot);
    DaemonStatus daemonStatus = new DaemonStatus(gradleWrapper);
    try {
      ArrayList<DaemonInfo> status = daemonStatus.get();
      replyWithSuccess(status);
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

  public void replyWithSuccess(ArrayList<DaemonInfo> status) {
    responseObserver.onNext(GetDaemonsStatusReply.newBuilder().addAllDaemonInfo(status).build());
  }
}
