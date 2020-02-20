package com.github.badsyntax.gradletasks.server;

import javax.inject.Inject;
import com.github.badsyntax.gradletasks.server.handlers.GetTasksHandler;
import io.grpc.stub.StreamObserver;

public class GradleTasksServiceImpl extends GradleTasksGrpc.GradleTasksImplBase {

  @Inject
  protected GetTasksHandler getTasks;

  @Inject
  public GradleTasksServiceImpl() {

  }

  @Override
  public void getTasks(GetTasksRequest req, StreamObserver<GetTasksReply> responseObserver) {
      getTasks.handle(req, responseObserver);
  }
}
