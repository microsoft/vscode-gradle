// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ExecuteCommandReply;
import com.github.badsyntax.gradle.ExecuteCommandRequest;
import com.github.badsyntax.gradle.transport.TaskException;
import com.github.badsyntax.gradle.transport.TaskReplySink;
import com.github.badsyntax.gradle.utils.Utils;
import java.util.List;

public class ExecuteCommandHandler {

	private ExecuteCommandRequest req;
	private TaskReplySink<ExecuteCommandReply> sink;

	private static final String GET_NORMALIZED_PACKAGE_NAME = "getNormalizedPackageName";

	public ExecuteCommandHandler(ExecuteCommandRequest req, TaskReplySink<ExecuteCommandReply> sink) {
		this.req = req;
		this.sink = sink;
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
		sink.onError(new TaskException(TaskException.Type.INTERNAL, e.getMessage(), e));
	}

	private void replyWithSuccess(String value) {
		sink.onNext(ExecuteCommandReply.newBuilder().setResult(value).build());
		sink.onCompleted();
	}
}
