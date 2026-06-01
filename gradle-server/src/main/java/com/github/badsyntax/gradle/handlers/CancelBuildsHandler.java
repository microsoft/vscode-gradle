package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelBuildsReply;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleResponse;
import com.github.badsyntax.gradle.transport.jsonrpc.JsonRpcCodec;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelBuildsHandler {
	private static final Logger logger = LoggerFactory.getLogger(CancelBuildsHandler.class.getName());

	private CompletableFuture<GradleResponse> response;

	public CancelBuildsHandler(CompletableFuture<GradleResponse> response) {
		this.response = response;
	}

	public void run() {
		try {
			GradleBuildCancellation.cancelBuilds();
			replyWithCancelledSuccess();
		} catch (GradleCancellationException e) {
			logger.error(e.getMessage());
			replyWithCancelError(e);
		}
	}

	private void replyWithCancelledSuccess() {
		CancelBuildsReply reply = CancelBuildsReply.newBuilder().setMessage("Cancel builds requested").build();
		response.complete(new GradleResponse(JsonRpcCodec.encode(reply)));
	}

	private void replyWithCancelError(Exception e) {
		CancelBuildsReply reply = CancelBuildsReply.newBuilder().setMessage(e.getMessage()).build();
		response.complete(new GradleResponse(JsonRpcCodec.encode(reply)));
	}
}
