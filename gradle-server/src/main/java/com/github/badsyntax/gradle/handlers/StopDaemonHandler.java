package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.StopDaemonReply;
import com.github.badsyntax.gradle.StopDaemonRequest;
import com.github.badsyntax.gradle.process.Process;
import io.grpc.stub.StreamObserver;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class StopDaemonHandler {
	private static final Logger logger = LoggerFactory.getLogger(StopDaemonHandler.class.getName());

	private StopDaemonRequest req;
	private StreamObserver<StopDaemonReply> responseObserver;

	public StopDaemonHandler(StopDaemonRequest req, StreamObserver<StopDaemonReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
	}

	public void run() {
		try {
			Process.kill(req.getPid());
			replyWithSuccess(String.format("Killed daemon with PID %s", req.getPid()));
		} catch (IOException e) {
			logger.error(e.getMessage());
			replyWithError(e);
		}
	}

	private void replyWithError(Exception e) {
		responseObserver.onError(ErrorMessageBuilder.build(e));
	}

	private void replyWithSuccess(String message) {
		responseObserver.onNext(StopDaemonReply.newBuilder().setMessage(message).build());
		responseObserver.onCompleted();
	}
}
