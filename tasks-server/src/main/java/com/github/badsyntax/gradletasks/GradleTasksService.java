package com.github.badsyntax.gradletasks;

import java.io.File;
import java.util.List;
import java.util.logging.Logger;

import com.google.rpc.Code;
import com.google.rpc.Status;
import org.gradle.tooling.BuildCancelledException;
import io.grpc.StatusRuntimeException;
import io.grpc.protobuf.StatusProto;
import io.grpc.stub.StreamObserver;

public class GradleTasksService extends GradleTasksGrpc.GradleTasksImplBase {
  private static final Logger logger = Logger.getLogger(GradleTasksService.class.getName());
  private static final String SOURCE_DIR_ERROR = "Source directory does not exist: %s";

  @Override
  public void getProject(GetProjectRequest req, StreamObserver<GetProjectReply> responseObserver) {
    try {
      File sourceDir = new File(req.getSourceDir().trim());
      if (!sourceDir.exists()) {
        throw new GradleTasksException(String.format(SOURCE_DIR_ERROR, req.getSourceDir()));
      }
      GradleTasksUtil.getProject(sourceDir, responseObserver);
    } catch (GradleTasksException e) {
      logger.warning(e.getMessage());
      StatusRuntimeException exception = StatusProto.toStatusRuntimeException(Status.newBuilder()
          .setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
      responseObserver.onError(exception);
    } finally {
      responseObserver.onCompleted();
    }
  }

  @Override
  public void runTask(RunTaskRequest req, StreamObserver<RunTaskReply> responseObserver) {
    try {
      File sourceDir = new File(req.getSourceDir().trim());
      if (!sourceDir.exists()) {
        throw new GradleTasksException(String.format(SOURCE_DIR_ERROR, req.getSourceDir()));
      }
      GradleTasksUtil.runTask(sourceDir, req.getTask(), req.getArgsList(), responseObserver);
    } catch (GradleTasksException e) {
      logger.warning(e.getMessage());
      StatusRuntimeException exception = StatusProto.toStatusRuntimeException(Status.newBuilder()
          .setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
      responseObserver.onError(exception);
    } finally {
      responseObserver.onCompleted();
    }
  }

  @Override
  public void cancelGetProjects(CancelGetProjectsRequest req,
      StreamObserver<CancelGetProjectsReply> responseObserver) {
    GradleTasksUtil.cancelGetProjects(responseObserver);
    responseObserver.onCompleted();
  }

  @Override
  public void cancelRunTask(CancelRunTaskRequest req,
      StreamObserver<CancelRunTaskReply> responseObserver) {
    try {
      File sourceDir = new File(req.getSourceDir().trim());
      if (!sourceDir.exists()) {
        throw new GradleTasksException(String.format(SOURCE_DIR_ERROR, req.getSourceDir()));
      }
      GradleTasksUtil.cancelRunTask(sourceDir, req.getTask(), responseObserver);
    } catch (GradleTasksException e) {
      logger.warning(e.getMessage());
      StatusRuntimeException exception = StatusProto.toStatusRuntimeException(Status.newBuilder()
          .setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
      responseObserver.onError(exception);
    } finally {
      responseObserver.onCompleted();
    }
  }

  @Override
  public void cancelRunTasks(CancelRunTasksRequest req,
      StreamObserver<CancelRunTasksReply> responseObserver) {
    GradleTasksUtil.cancelRunTasks(responseObserver);
    responseObserver.onCompleted();
  }
}
