// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ExecuteCommandReply;
import com.github.badsyntax.gradle.ExecuteCommandRequest;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleResponse;
import com.github.badsyntax.gradle.transport.jsonrpc.JsonRpcCodec;
import com.github.badsyntax.gradle.utils.Utils;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class ExecuteCommandHandler {

	private ExecuteCommandRequest req;
	private CompletableFuture<GradleResponse> response;

	private static final String GET_NORMALIZED_PACKAGE_NAME = "getNormalizedPackageName";

	public ExecuteCommandHandler(ExecuteCommandRequest req, CompletableFuture<GradleResponse> response) {
		this.req = req;
		this.response = response;
	}

	public void run() {
		String command = req.getCommand();
		switch (command) {
			case GET_NORMALIZED_PACKAGE_NAME :
				List<String> arguments = req.getArgumentsList();
				if (arguments == null || arguments.size() != 1) {
					replyWithError(new Exception("illegal Arguments"));
					return;
				}
				try {
					replyWithSuccess(Utils.normalizePackageName(arguments.get(0)));
				} catch (Exception e) {
					replyWithError(e);
				}
				return;
			default :
				replyWithError(new Exception("Unknown command: " + command));
		}
	}

	private void replyWithError(Exception e) {
		response.completeExceptionally(JsonRpcCodec.error(JsonRpcCodec.ERROR_INTERNAL, e));
	}

	private void replyWithSuccess(String value) {
		ExecuteCommandReply reply = ExecuteCommandReply.newBuilder().setResult(value).build();
		response.complete(new GradleResponse(JsonRpcCodec.encode(reply)));
	}
}
