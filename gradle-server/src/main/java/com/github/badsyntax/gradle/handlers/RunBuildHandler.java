package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ByteBufferOutputStream;
import com.github.badsyntax.gradle.Cancelled;
import com.github.badsyntax.gradle.GradleBuildRunner;
import com.github.badsyntax.gradle.Output;
import com.github.badsyntax.gradle.Progress;
import com.github.badsyntax.gradle.RunBuildReply;
import com.github.badsyntax.gradle.RunBuildRequest;
import com.github.badsyntax.gradle.RunBuildResult;
import com.github.badsyntax.gradle.exceptions.GradleBuildRunnerException;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleClient;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleResponse;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleStreamPayload;
import com.github.badsyntax.gradle.transport.jsonrpc.JsonRpcCodec;
import com.google.common.base.Strings;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.concurrent.CompletableFuture;
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
	private CompletableFuture<GradleResponse> response;
	private GradleClient client;
	private long streamId;
	private ProgressListener progressListener;
	private ByteBufferOutputStream standardOutputListener;
	private ByteBufferOutputStream standardErrorListener;

	public RunBuildHandler(RunBuildRequest req, CompletableFuture<GradleResponse> response, GradleClient client,
			long streamId) {
		this.req = req;
		this.response = response;
		this.client = client;
		this.streamId = streamId;
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
				req.getJavaDebugCleanOutputCache(), req.getAdditionalToolOptions());
		gradleRunner.setProgressListener(progressListener).setStandardOutputStream(standardOutputListener)
				.setStandardErrorStream(standardErrorListener);

		if (!Strings.isNullOrEmpty(req.getInput())) {
			gradleRunner.setStandardInputStream(new ByteArrayInputStream(req.getInput().getBytes()));
		}

		try {
			gradleRunner.run();
			replyWithSuccess();
		} catch (BuildCancelledException e) {
			replyWithCancelled(e);
		} catch (BuildException | UnsupportedVersionException | UnsupportedBuildArgumentException
				| IllegalStateException | IOException | GradleBuildRunnerException e) {
			logger.error(e.getMessage());
			replyWithError(e);
		}
	}

	public void replyWithCancelled(BuildCancelledException e) {
		RunBuildReply reply = RunBuildReply.newBuilder()
				.setCancelled(Cancelled.newBuilder().setMessage(e.getMessage()).setProjectDir(req.getProjectDir()))
				.build();
		response.complete(new GradleResponse(JsonRpcCodec.encode(reply)));
	}

	public void replyWithError(Exception e) {
		response.completeExceptionally(JsonRpcCodec.error(JsonRpcCodec.ERROR_INTERNAL, e));
	}

	public void replyWithSuccess() {
		RunBuildReply reply = RunBuildReply.newBuilder()
				.setRunBuildResult(RunBuildResult.newBuilder().setMessage("Successfully run build")).build();
		response.complete(new GradleResponse(JsonRpcCodec.encode(reply)));
	}

	private void notify(RunBuildReply reply) {
		client.onRunBuildReply(new GradleStreamPayload(streamId, JsonRpcCodec.encode(reply)));
	}

	private void replyWithProgress(ProgressEvent progressEvent) {
		notify(RunBuildReply.newBuilder().setProgress(Progress.newBuilder().setMessage(progressEvent.getDisplayName()))
				.build());
	}

	private void replyWithStandardOutput(byte[] bytes) {
		ByteString byteString = ByteString.copyFrom(bytes);
		notify(RunBuildReply.newBuilder()
				.setOutput(Output.newBuilder().setOutputType(Output.OutputType.STDOUT).setOutputBytes(byteString))
				.build());
	}

	private void replyWithStandardError(byte[] bytes) {
		ByteString byteString = ByteString.copyFrom(bytes);
		notify(RunBuildReply.newBuilder()
				.setOutput(Output.newBuilder().setOutputType(Output.OutputType.STDERR).setOutputBytes(byteString))
				.build());
	}
}
