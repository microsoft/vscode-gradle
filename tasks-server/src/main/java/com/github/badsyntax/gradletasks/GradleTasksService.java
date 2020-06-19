package com.github.badsyntax.gradletasks;

import com.github.badsyntax.gradletasks.actions.GradleProjectBuilder;
import com.github.badsyntax.gradletasks.actions.GradleTaskCanceller;
import com.github.badsyntax.gradletasks.actions.GradleTaskRunner;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.github.badsyntax.gradletasks.exceptions.GradleConnectionException;
import io.grpc.stub.StreamObserver;
import org.gradle.tooling.GradleConnector;

public class GradleTasksService extends GradleTasksGrpc.GradleTasksImplBase {
  // private static final Logger logger = Logger.getLogger(GradleTasksService.class);
  private String pluginPath;

  GradleTasksService(String pluginPath) {
    this.pluginPath = pluginPath;
  }

  @Override
  public void getBuild(GetBuildRequest req, StreamObserver<GetBuildReply> responseObserver) {
    try {
      GradleConnector gradleConnector =
          GradleProjectConnector.build(req.getProjectDir(), req.getGradleConfig());
      GradleProjectBuilder projectBuilder =
          new GradleProjectBuilder(req, responseObserver, gradleConnector, pluginPath);
      projectBuilder.build();
    } catch (GradleConnectionException e) {
      // logger.error(e.getMessage());
      responseObserver.onError(ErrorMessageBuilder.build(e));
    }
  }

  @Override
  public void runTask(RunTaskRequest req, StreamObserver<RunTaskReply> responseObserver) {
    try {
      GradleConnector gradleConnector =
          GradleProjectConnector.build(req.getProjectDir(), req.getGradleConfig());
      GradleTaskRunner taskRunner = new GradleTaskRunner(req, responseObserver, gradleConnector);
      taskRunner.run();
    } catch (GradleConnectionException e) {
      // logger.error(e.getMessage());
      responseObserver.onError(ErrorMessageBuilder.build(e));
    }
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
    GradleTaskCanceller gradleTaskCanceller = new GradleTaskCanceller(req, responseObserver);
    gradleTaskCanceller.cancelRunTask();
  }

  @Override
  public void cancelRunTasks(
      CancelRunTasksRequest req, StreamObserver<CancelRunTasksReply> responseObserver) {
    CancellationHandler.cancelAllRunningTasks();
    responseObserver.onNext(
        CancelRunTasksReply.newBuilder().setMessage("Cancel running tasks requested").build());
    responseObserver.onCompleted();
  }
}
