package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelBuildReply;
import com.github.badsyntax.gradle.CancelBuildRequest;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleResponse;
import com.github.badsyntax.gradle.transport.jsonrpc.JsonRpcCodec;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelBuildHandler {
	private static final Logger logger = LoggerFactory.getLogger(CancelBuildHandler.class.getName());

	private CancelBuildRequest req;
	private CompletableFuture<GradleResponse> response;

	public CancelBuildHandler(CancelBuildRequest req, CompletableFuture<GradleResponse> response) {
		this.req = req;
		this.response = response;
	}

	public void run() {
		try {
			GradleBuildCancellation.cancelBuild(req.getCancellationKey());
			replyWithCancelledSuccess();
		} catch (GradleCancellationException e) {
			logger.error(e.getMessage());
			replyWithCancelError(e);
		}
	}

	private void replyWithCancelledSuccess() {
		CancelBuildReply reply = CancelBuildReply.newBuilder().setMessage("Cancel build requested")
				.setBuildRunning(true).build();
		response.complete(new GradleResponse(JsonRpcCodec.encode(reply)));
	}

	private void replyWithCancelError(Exception e) {
		CancelBuildReply reply = CancelBuildReply.newBuilder().setMessage(e.getMessage()).setBuildRunning(false)
				.build();
		response.complete(new GradleResponse(JsonRpcCodec.encode(reply)));
	}
}
