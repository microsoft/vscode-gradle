package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelBuildsReply;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelBuildsHandler {
	private static final Logger logger = LoggerFactory.getLogger(CancelBuildsHandler.class.getName());

	private StreamObserver<CancelBuildsReply> responseObserver;

	public CancelBuildsHandler(StreamObserver<CancelBuildsReply> responseObserver) {
		this.responseObserver = responseObserver;
	}

	public void run() {
		try {
			GradleBuildCancellation.cancelBuilds();
			replyWithCancelledSuccess();
		} catch (GradleCancellationException e) {
			logger.error(e.getMessage());
			replyWithCancelError(e);
		} finally {
			responseObserver.onCompleted();
		}
	}

	private void replyWithCancelledSuccess() {
		responseObserver.onNext(CancelBuildsReply.newBuilder().setMessage("Cancel builds requested").build());
	}

	private void replyWithCancelError(Exception e) {
		responseObserver.onNext(CancelBuildsReply.newBuilder().setMessage(e.getMessage()).build());
	}
}
