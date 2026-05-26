package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.handlers.CancelBuildHandler;
import com.github.badsyntax.gradle.handlers.CancelBuildsHandler;
import com.github.badsyntax.gradle.handlers.ExecuteCommandHandler;
import com.github.badsyntax.gradle.handlers.GetBuildHandler;
import com.github.badsyntax.gradle.handlers.GetProjectDependenciesHandler;
import com.github.badsyntax.gradle.handlers.RunBuildHandler;
import com.github.badsyntax.gradle.transport.GrpcReplySinkAdapter;
import io.grpc.stub.StreamObserver;

public class TaskService extends GradleGrpc.GradleImplBase {

	@Override
	public void getBuild(GetBuildRequest req, StreamObserver<GetBuildReply> responseObserver) {
		GetBuildHandler getBuildHandler = new GetBuildHandler(req, new GrpcReplySinkAdapter<>(responseObserver));
		getBuildHandler.run();
	}

	@Override
	public void getProjectDependencies(GetProjectDependenciesRequest req,
			StreamObserver<GetProjectDependenciesReply> responseObserver) {
		GetProjectDependenciesHandler handler = new GetProjectDependenciesHandler(req,
				new GrpcReplySinkAdapter<>(responseObserver));
		handler.run();
	}

	@Override
	public void runBuild(RunBuildRequest req, StreamObserver<RunBuildReply> responseObserver) {
		RunBuildHandler runBuildHandler = new RunBuildHandler(req, new GrpcReplySinkAdapter<>(responseObserver));
		runBuildHandler.run();
	}

	@Override
	public void cancelBuild(CancelBuildRequest req, StreamObserver<CancelBuildReply> responseObserver) {
		CancelBuildHandler cancelRunBuildHandler = new CancelBuildHandler(req,
				new GrpcReplySinkAdapter<>(responseObserver));
		cancelRunBuildHandler.run();
	}

	@Override
	public void cancelBuilds(CancelBuildsRequest req, StreamObserver<CancelBuildsReply> responseObserver) {
		CancelBuildsHandler cancelRunBuildsHandler = new CancelBuildsHandler(
				new GrpcReplySinkAdapter<>(responseObserver));
		cancelRunBuildsHandler.run();
	}

	@Override
	public void executeCommand(ExecuteCommandRequest req, StreamObserver<ExecuteCommandReply> responseObserver) {
		ExecuteCommandHandler executeCommandHandler = new ExecuteCommandHandler(req,
				new GrpcReplySinkAdapter<>(responseObserver));
		executeCommandHandler.run();
	}
}
