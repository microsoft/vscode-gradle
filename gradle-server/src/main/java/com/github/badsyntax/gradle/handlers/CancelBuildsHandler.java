package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelBuildsReply;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import com.github.badsyntax.gradle.transport.TaskReplySink;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelBuildsHandler {
	private static final Logger logger = LoggerFactory.getLogger(CancelBuildsHandler.class.getName());

	private TaskReplySink<CancelBuildsReply> sink;

	public CancelBuildsHandler(TaskReplySink<CancelBuildsReply> sink) {
		this.sink = sink;
	}

	public void run() {
		try {
			GradleBuildCancellation.cancelBuilds();
			replyWithCancelledSuccess();
		} catch (GradleCancellationException e) {
			logger.error(e.getMessage());
			replyWithCancelError(e);
		} finally {
			sink.onCompleted();
		}
	}

	private void replyWithCancelledSuccess() {
		sink.onNext(CancelBuildsReply.newBuilder().setMessage("Cancel builds requested").build());
	}

	private void replyWithCancelError(Exception e) {
		sink.onNext(CancelBuildsReply.newBuilder().setMessage(e.getMessage()).build());
	}
}
