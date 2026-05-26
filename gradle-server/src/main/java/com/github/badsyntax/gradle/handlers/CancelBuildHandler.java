package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelBuildReply;
import com.github.badsyntax.gradle.CancelBuildRequest;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import com.github.badsyntax.gradle.transport.TaskReplySink;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelBuildHandler {
	private static final Logger logger = LoggerFactory.getLogger(CancelBuildHandler.class.getName());

	private CancelBuildRequest req;
	private TaskReplySink<CancelBuildReply> sink;

	public CancelBuildHandler(CancelBuildRequest req, TaskReplySink<CancelBuildReply> sink) {
		this.req = req;
		this.sink = sink;
	}

	public void run() {
		try {
			GradleBuildCancellation.cancelBuild(req.getCancellationKey());
			replyWithCancelledSuccess();
		} catch (GradleCancellationException e) {
			logger.error(e.getMessage());
			replyWithCancelError(e);
		} finally {
			sink.onCompleted();
		}
	}

	private void replyWithCancelledSuccess() {
		sink.onNext(CancelBuildReply.newBuilder().setMessage("Cancel build requested").setBuildRunning(true).build());
	}

	private void replyWithCancelError(Exception e) {
		sink.onNext(CancelBuildReply.newBuilder().setMessage(e.getMessage()).setBuildRunning(false).build());
	}
}
