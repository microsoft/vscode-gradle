package com.github.badsyntax.gradletasks;

import java.io.File;
import com.google.rpc.Code;
import com.google.rpc.Status;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.grpc.StatusRuntimeException;
import io.grpc.protobuf.StatusProto;
import io.grpc.stub.StreamObserver;

public class GradleTasksService extends GradleTasksGrpc.GradleTasksImplBase {
  private static final Logger logger = LoggerFactory.getLogger(GradleTasksService.class.getName());
  private static final String PROJECT_DIR_ERROR = "Project directory does not exist: %s";

  @Override
  public void getBuild(final GetBuildRequest req,
      final StreamObserver<GetBuildReply> responseObserver) {
    try {
      File projectDir = new File(req.getProjectDir().trim());
      if (!projectDir.exists()) {
        throw new GradleTasksException(String.format(PROJECT_DIR_ERROR, req.getProjectDir()));
      }
      GradleTasksUtil.getBuild(projectDir, responseObserver);
      responseObserver.onCompleted();
    } catch (GradleTasksException e) {
      logger.error(e.getMessage());
      StatusRuntimeException exception = StatusProto.toStatusRuntimeException(Status.newBuilder()
          .setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
      responseObserver.onError(exception);
    }
  }

  @Override
  public void runTask(final RunTaskRequest req,
      final StreamObserver<RunTaskReply> responseObserver) {
    try {
      File projectDir = new File(req.getProjectDir().trim());
      if (!projectDir.exists()) {
        throw new GradleTasksException(String.format(PROJECT_DIR_ERROR, req.getProjectDir()));
      }
      GradleTasksUtil.runTask(projectDir, req.getTask(), req.getArgsList(), responseObserver);
      responseObserver.onCompleted();
    } catch (GradleTasksException e) {
      logger.error(e.getMessage());
      StatusRuntimeException exception = StatusProto.toStatusRuntimeException(Status.newBuilder()
          .setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
      responseObserver.onError(exception);
    }
  }

  @Override
  public void cancelGetBuilds(final CancelGetBuildsRequest req,
      final StreamObserver<CancelGetBuildsReply> responseObserver) {
    GradleTasksUtil.cancelGetBuilds(responseObserver);
    responseObserver.onCompleted();
  }

  @Override
  public void cancelRunTask(final CancelRunTaskRequest req,
      final StreamObserver<CancelRunTaskReply> responseObserver) {
    try {
      File projectDir = new File(req.getProjectDir().trim());
      if (!projectDir.exists()) {
        throw new GradleTasksException(String.format(PROJECT_DIR_ERROR, req.getProjectDir()));
      }
      GradleTasksUtil.cancelRunTask(projectDir, req.getTask(), responseObserver);
      responseObserver.onCompleted();
    } catch (GradleTasksException e) {
      logger.error(e.getMessage());
      StatusRuntimeException exception = StatusProto.toStatusRuntimeException(Status.newBuilder()
          .setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
      responseObserver.onError(exception);
    }
  }

  @Override
  public void cancelRunTasks(final CancelRunTasksRequest req,
      final StreamObserver<CancelRunTasksReply> responseObserver) {
    GradleTasksUtil.cancelRunTasks(responseObserver);
    responseObserver.onCompleted();
  }
}
