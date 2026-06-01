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
	// Guards write ordering of stream notifications for this single build only.
	// progress/stdout/stderr fire from different threads; serialising them keeps
	// the notification order on this stream deterministic. It is intentionally a
	// per-handler lock (not a class lock) so concurrent builds never block each
	// other's output flushes.
	private final Object streamLock = new Object();

	public RunBuildHandler(RunBuildRequest req, CompletableFuture<GradleResponse> response, GradleClient client,
			long streamId) {
		this.req = req;
		this.response = response;
		this.client = client;
		this.streamId = streamId;
		this.progressListener = (ProgressEvent event) -> {
			synchronized (streamLock) {
				replyWithProgress(event);
			}
		};
		this.standardOutputListener = new ByteBufferOutputStream() {
			@Override
			public void onFlush(byte[] bytes) {
				synchronized (streamLock) {
					replyWithStandardOutput(bytes);
				}
			}
		};
		this.standardErrorListener = new ByteBufferOutputStream() {
			@Override
			public void onFlush(byte[] bytes) {
				synchronized (streamLock) {
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
		} catch (UnsupportedVersionException | UnsupportedBuildArgumentException e) {
			// Client-caused: the request targeted an unsupported Gradle version or
			// passed an invalid build argument. Report it as UNKNOWN ("bad request")
			// so the TS client can tell it apart from an unexpected server failure
			// (INTERNAL). Mirrors the convention in ExecuteCommandHandler.
			logger.error(e.getMessage());
			replyWithError(JsonRpcCodec.ERROR_UNKNOWN, e);
		} catch (BuildException | IllegalStateException | IOException | GradleBuildRunnerException e) {
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
		replyWithError(JsonRpcCodec.ERROR_INTERNAL, e);
	}

	public void replyWithError(int code, Exception e) {
		response.completeExceptionally(JsonRpcCodec.error(code, e));
	}

	public void replyWithSuccess() {
		RunBuildReply reply = RunBuildReply.newBuilder()
				.setRunBuildResult(RunBuildResult.newBuilder().setMessage("Successfully run build")).build();
		response.complete(new GradleResponse(JsonRpcCodec.encode(reply)));
	}

	// Stream notifications and the terminal response travel on two different
	// channels (server->client notification vs. the request's response future).
	// Invariant: every notify(...) for this streamId is enqueued before the
	// response future is completed by replyWithSuccess/replyWithCancelled/
	// replyWithError. Because LSP4J serialises all outbound writes on a single
	// RemoteEndpoint, this guarantees the client observes all progress/output
	// before the terminal reply. Do not move notify(...) off this thread or
	// after response.complete(...) without re-establishing that ordering.
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
