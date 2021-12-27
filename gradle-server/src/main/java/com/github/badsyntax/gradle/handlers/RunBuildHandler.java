package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ByteBufferOutputStream;
import com.github.badsyntax.gradle.Cancelled;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GradleBuildRunner;
import com.github.badsyntax.gradle.Output;
import com.github.badsyntax.gradle.Progress;
import com.github.badsyntax.gradle.RunBuildReply;
import com.github.badsyntax.gradle.RunBuildRequest;
import com.github.badsyntax.gradle.RunBuildResult;
import com.github.badsyntax.gradle.exceptions.GradleBuildRunnerException;
import com.google.common.base.Strings;
import com.google.protobuf.ByteString;
import io.grpc.stub.StreamObserver;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.UnsupportedVersionException;
import org.gradle.tooling.events.ProgressEvent;
import org.gradle.tooling.events.ProgressListener;
import org.gradle.tooling.exceptions.UnsupportedBuildArgumentException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RunBuildHandler {
	private static final Logger logger = LoggerFactory.getLogger(RunBuildHandler.class.getName());

	private RunBuildRequest req;
	private StreamObserver<RunBuildReply> responseObserver;
	private ProgressListener progressListener;
	private ByteBufferOutputStream standardOutputListener;
	private ByteBufferOutputStream standardErrorListener;

	public RunBuildHandler(RunBuildRequest req, StreamObserver<RunBuildReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
		this.progressListener = (ProgressEvent event) -> {
			synchronized (RunBuildHandler.class) {
				replyWithProgress(event);
			}
		};
		this.standardOutputListener = new ByteBufferOutputStream() {
			@Override
			public void onFlush(byte[] bytes) {
				synchronized (RunBuildHandler.class) {
					replyWithStandardOutput(bytes);
				}
			}
		};
		this.standardErrorListener = new ByteBufferOutputStream() {
			@Override
			public void onFlush(byte[] bytes) {
				synchronized (RunBuildHandler.class) {
					replyWithStandardError(bytes);
				}
			}
		};
	}

	public void run() {
		GradleBuildRunner gradleRunner = new GradleBuildRunner(req.getProjectDir(), req.getArgsList(),
				req.getGradleConfig(), req.getCancellationKey(), req.getShowOutputColors(), req.getJavaDebugPort(),
				req.getJavaDebugCleanOutputCache());
		gradleRunner.setProgressListener(progressListener).setStandardOutputStream(standardOutputListener)
				.setStandardErrorStream(standardErrorListener);

		if (!Strings.isNullOrEmpty(req.getInput())) {
			gradleRunner.setStandardInputStream(new ByteArrayInputStream(req.getInput().getBytes()));
		}

		try {
			gradleRunner.run();
			replyWithSuccess();
			responseObserver.onCompleted();
		} catch (BuildCancelledException e) {
			replyWithCancelled(e);
			responseObserver.onCompleted();
		} catch (BuildException | UnsupportedVersionException | UnsupportedBuildArgumentException
				| IllegalStateException | IOException | GradleBuildRunnerException e) {
			logger.error(e.getMessage());
			replyWithError(e);
		}
	}

	public void replyWithCancelled(BuildCancelledException e) {
		responseObserver.onNext(RunBuildReply.newBuilder()
				.setCancelled(Cancelled.newBuilder().setMessage(e.getMessage()).setProjectDir(req.getProjectDir()))
				.build());
	}

	public void replyWithError(Exception e) {
		responseObserver.onError(ErrorMessageBuilder.build(e));
	}

	public void replyWithSuccess() {
		responseObserver.onNext(RunBuildReply.newBuilder()
				.setRunBuildResult(RunBuildResult.newBuilder().setMessage("Successfully run build")).build());
	}

	private void replyWithProgress(ProgressEvent progressEvent) {
		responseObserver.onNext(RunBuildReply.newBuilder()
				.setProgress(Progress.newBuilder().setMessage(progressEvent.getDisplayName())).build());
	}

	private void replyWithStandardOutput(byte[] bytes) {
		ByteString byteString = ByteString.copyFrom(bytes);
		responseObserver.onNext(RunBuildReply.newBuilder()
				.setOutput(Output.newBuilder().setOutputType(Output.OutputType.STDOUT).setOutputBytes(byteString))
				.build());
	}

	private void replyWithStandardError(byte[] bytes) {
		ByteString byteString = ByteString.copyFrom(bytes);
		responseObserver.onNext(RunBuildReply.newBuilder()
				.setOutput(Output.newBuilder().setOutputType(Output.OutputType.STDERR).setOutputBytes(byteString))
				.build());
	}
}
