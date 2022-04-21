// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.ExecuteCommandReply;
import com.github.badsyntax.gradle.ExecuteCommandRequest;
import com.github.badsyntax.gradle.utils.Utils;
import io.grpc.stub.StreamObserver;
import java.util.List;

public class ExecuteCommandHandler {

	private ExecuteCommandRequest req;
	private StreamObserver<ExecuteCommandReply> responseObserver;

	private static final String GET_NORMALIZED_PACKAGE_NAME = "getNormalizedPackageName";

	public ExecuteCommandHandler(ExecuteCommandRequest req, StreamObserver<ExecuteCommandReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
	}

	public void run() {
		String command = req.getCommand();
		switch (command) {
			case GET_NORMALIZED_PACKAGE_NAME :
				List<String> arguments = req.getArgumentsList();
				if (arguments == null || arguments.size() != 1) {
					replyWithError(new Exception("illegal Arguments"));
				}
				try {
					replyWithSuccess(Utils.normalizePackageName(arguments.get(0)));
				} catch (Exception e) {
					replyWithError(e);
				}
		}
	}

	private void replyWithError(Exception e) {
		responseObserver.onError(ErrorMessageBuilder.build(e));
	}

	private void replyWithSuccess(String value) {
		responseObserver.onNext(ExecuteCommandReply.newBuilder().setResult(value).build());
		responseObserver.onCompleted();
	}
}
