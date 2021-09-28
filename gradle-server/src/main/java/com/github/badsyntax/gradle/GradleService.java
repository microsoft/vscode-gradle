package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.handlers.CancelBuildHandler;
import com.github.badsyntax.gradle.handlers.CancelBuildsHandler;
import com.github.badsyntax.gradle.handlers.CancelProjectsHandler;
import com.github.badsyntax.gradle.handlers.GetBuildHandler;
import com.github.badsyntax.gradle.handlers.GetDaemonsStatusHandler;
import com.github.badsyntax.gradle.handlers.GetProjectsHandler;
import com.github.badsyntax.gradle.handlers.RunBuildHandler;
import com.github.badsyntax.gradle.handlers.StopDaemonHandler;
import com.github.badsyntax.gradle.handlers.StopDaemonsHandler;
import io.grpc.stub.StreamObserver;

public class GradleService extends GradleGrpc.GradleImplBase {

  @Override
  public void getBuild(GetBuildRequest req, StreamObserver<GetBuildReply> responseObserver) {
    GetBuildHandler getBuildHandler = new GetBuildHandler(req, responseObserver);
    getBuildHandler.run();
  }

  @Override
  public void getProjects(
      GetProjectsRequest req, StreamObserver<GetProjectsReply> responseObserver) {
    GetProjectsHandler getProjectsHandler = new GetProjectsHandler(req, responseObserver);
    getProjectsHandler.run();
  }

  @Override
  public void runBuild(RunBuildRequest req, StreamObserver<RunBuildReply> responseObserver) {
    RunBuildHandler runBuildHandler = new RunBuildHandler(req, responseObserver);
    runBuildHandler.run();
  }

  @Override
  public void cancelBuild(
      CancelBuildRequest req, StreamObserver<CancelBuildReply> responseObserver) {
    CancelBuildHandler cancelRunBuildHandler = new CancelBuildHandler(req, responseObserver);
    cancelRunBuildHandler.run();
  }

  @Override
  public void cancelBuilds(
      CancelBuildsRequest req, StreamObserver<CancelBuildsReply> responseObserver) {
    CancelBuildsHandler cancelRunBuildsHandler = new CancelBuildsHandler(responseObserver);
    cancelRunBuildsHandler.run();
  }

  @Override
  public void cancelProjects(
      CancelProjectsRequest req, StreamObserver<CancelProjectsReply> responseObserver) {
    CancelProjectsHandler cancelProjectsHandler = new CancelProjectsHandler(req, responseObserver);
    cancelProjectsHandler.run();
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
