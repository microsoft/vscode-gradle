package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.DaemonInfo;
import com.github.badsyntax.gradletasks.DaemonStatus;
import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.GetStatusReply;
import com.github.badsyntax.gradletasks.GetStatusRequest;
import com.github.badsyntax.gradletasks.GradleWrapperExecutor;
import com.github.badsyntax.gradletasks.exceptions.GradleStatusException;
import com.github.badsyntax.gradletasks.exceptions.GradleWrapperException;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.util.ArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleStatus {
  private static final Logger logger = LoggerFactory.getLogger(GradleStatus.class.getName());

  private GetStatusRequest req;
  private StreamObserver<GetStatusReply> responseObserver;

  public GradleStatus(GetStatusRequest req, StreamObserver<GetStatusReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() throws GradleStatusException {
    File projectRoot = new File(req.getProjectDir());
    GradleWrapperExecutor gradleWrapper = new GradleWrapperExecutor(projectRoot);
    DaemonStatus daemonStatus = new DaemonStatus(gradleWrapper);
    try {
      ArrayList<DaemonInfo> status = daemonStatus.get();
      replyWithSuccess(status);
    } catch (GradleWrapperException e) {
      replyWithError(e);
    } finally {
      responseObserver.onCompleted();
    }
  }

  public void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  public void replyWithSuccess(ArrayList<DaemonInfo> status) {
    responseObserver.onNext(GetStatusReply.newBuilder().addAllDaemonInfo(status).build());
  }
}
