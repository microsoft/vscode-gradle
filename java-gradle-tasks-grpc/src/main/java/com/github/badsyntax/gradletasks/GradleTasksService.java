package com.github.badsyntax.gradletasks;

import java.io.File;
import java.util.List;
import java.util.logging.Logger;

import com.google.rpc.Code;
import com.google.rpc.Status;

import io.grpc.StatusRuntimeException;
import io.grpc.protobuf.StatusProto;
import io.grpc.stub.StreamObserver;

public class GradleTasksService extends GradleTasksGrpc.GradleTasksImplBase {
  private static final Logger logger = Logger.getLogger(GradleTasksService.class.getName());

  @Override
  public void getTasks(GetTasksRequest req, StreamObserver<GetTasksReply> responseObserver) {
    try {
      File sourceDir = new File(req.getSourceDir().trim());
      if (!sourceDir.exists()) {
        throw new GradleTasksException(String.format("Source directory does not exist: %s", req.getSourceDir()));
      }
      List<GradleTask> gradleTasks = GradleTasksUtil.getTasks(sourceDir, responseObserver);
      GetTasksResult result = GetTasksResult.newBuilder().addAllTasks(gradleTasks).build();
      GetTasksReply reply = GetTasksReply.newBuilder().setGetTasksResult(result).build();
      responseObserver.onNext(reply);
      responseObserver.onCompleted();
    } catch (GradleTasksException e) {
      logger.warning(e.getMessage());
      StatusRuntimeException exception = StatusProto.toStatusRuntimeException(
          Status.newBuilder().setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
      responseObserver.onError(exception);
    }
  }

  @Override
  public void runTask(RunTaskRequest req, StreamObserver<RunTaskReply> responseObserver) {
    try {
      File sourceDir = new File(req.getSourceDir().trim());
      if (!sourceDir.exists()) {
        throw new GradleTasksException(String.format("Source directory does not exist: %s", req.getSourceDir()));
      }
      GradleTasksUtil.runTask(sourceDir, req.getTask(), req.getArgsList(), responseObserver);
      RunTaskResult result = RunTaskResult.newBuilder().setMessage("Successfully run task").setTask(req.getTask())
          .build();
      RunTaskReply reply = RunTaskReply.newBuilder().setRunTaskResult(result).build();
      responseObserver.onNext(reply);
      responseObserver.onCompleted();
    } catch (GradleTasksException e) {
      logger.warning(e.getMessage());
      StatusRuntimeException exception = StatusProto.toStatusRuntimeException(
          Status.newBuilder().setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
      responseObserver.onError(exception);
    }
  }
}
