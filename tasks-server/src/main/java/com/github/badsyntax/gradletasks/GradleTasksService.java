package com.github.badsyntax.gradletasks;

import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.github.badsyntax.gradletasks.handlers.CancelTaskHandler;
import com.github.badsyntax.gradletasks.handlers.GetBuildHandler;
import com.github.badsyntax.gradletasks.handlers.GetDaemonsStatusHandler;
import com.github.badsyntax.gradletasks.handlers.RunTaskHandler;
import com.github.badsyntax.gradletasks.handlers.StopDaemonHandler;
import com.github.badsyntax.gradletasks.handlers.StopDaemonsHandler;
import io.grpc.stub.StreamObserver;

public class GradleTasksService extends GradleTasksGrpc.GradleTasksImplBase {

  @Override
  public void getBuild(GetBuildRequest req, StreamObserver<GetBuildReply> responseObserver) {
    GetBuildHandler getBuildHandler = new GetBuildHandler(req, responseObserver);
    getBuildHandler.run();
  }

  @Override
  public void runTask(RunTaskRequest req, StreamObserver<RunTaskReply> responseObserver) {
    RunTaskHandler runTaskHandler = new RunTaskHandler(req, responseObserver);
    runTaskHandler.run();
  }

  @Override
  public void cancelGetBuilds(
      CancelGetBuildsRequest req, StreamObserver<CancelGetBuildsReply> responseObserver) {
    CancellationHandler.cancelAllRunningBuilds();
    responseObserver.onNext(
        CancelGetBuildsReply.newBuilder().setMessage("Cancel build projects requested").build());
    responseObserver.onCompleted();
  }

  @Override
  public void cancelRunTask(
      CancelRunTaskRequest req, StreamObserver<CancelRunTaskReply> responseObserver) {
    CancelTaskHandler cancelTaskHandler = new CancelTaskHandler(req, responseObserver);
    cancelTaskHandler.run();
  }

  @Override
  public void cancelRunTasks(
      CancelRunTasksRequest req, StreamObserver<CancelRunTasksReply> responseObserver) {
    CancellationHandler.cancelAllRunningTasks();
    responseObserver.onNext(
        CancelRunTasksReply.newBuilder().setMessage("Cancel running tasks requested").build());
    responseObserver.onCompleted();
  }

  @Override
  public void getDaemonsStatus(
      GetDaemonsStatusRequest req, StreamObserver<GetDaemonsStatusReply> responseObserver) {
    GetDaemonsStatusHandler getDaemonsStatusHandler =
        new GetDaemonsStatusHandler(req, responseObserver);
    getDaemonsStatusHandler.run();
  }

  @Override
  public void stopDaemons(
      StopDaemonsRequest req, StreamObserver<StopDaemonsReply> responseObserver) {
    StopDaemonsHandler stopDaemonsHandler = new StopDaemonsHandler(req, responseObserver);
    stopDaemonsHandler.run();
  }

  @Override
  public void stopDaemon(StopDaemonRequest req, StreamObserver<StopDaemonReply> responseObserver) {
    StopDaemonHandler stopDaemonHandler = new StopDaemonHandler(req, responseObserver);
    stopDaemonHandler.run();
  }
}
