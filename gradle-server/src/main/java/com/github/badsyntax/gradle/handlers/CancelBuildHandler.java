package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelBuildReply;
import com.github.badsyntax.gradle.CancelBuildRequest;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelBuildHandler {
	private static final Logger logger = LoggerFactory.getLogger(CancelBuildHandler.class.getName());

	private CancelBuildRequest req;
	private StreamObserver<CancelBuildReply> responseObserver;

	public CancelBuildHandler(CancelBuildRequest req, StreamObserver<CancelBuildReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
	}

	public void run() {
		try {
			GradleBuildCancellation.cancelBuild(req.getCancellationKey());
			replyWithCancelledSuccess();
		} catch (GradleCancellationException e) {
			logger.error(e.getMessage());
			replyWithCancelError(e);
		} finally {
			responseObserver.onCompleted();
		}
	}

	private void replyWithCancelledSuccess() {
		responseObserver.onNext(
				CancelBuildReply.newBuilder().setMessage("Cancel build requested").setBuildRunning(true).build());
	}

	private void replyWithCancelError(Exception e) {
		responseObserver
				.onNext(CancelBuildReply.newBuilder().setMessage(e.getMessage()).setBuildRunning(false).build());
	}
}
