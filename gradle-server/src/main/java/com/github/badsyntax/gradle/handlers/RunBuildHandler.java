package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ByteBufferOutputStream;
import com.github.badsyntax.gradle.Cancelled;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GradleBuildRunner;
import com.github.badsyntax.gradle.GradleTestEvent;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.BuildException;
import org.gradle.tooling.Failure;
import org.gradle.tooling.UnsupportedVersionException;
import org.gradle.tooling.events.ProgressEvent;
import org.gradle.tooling.events.ProgressListener;
import org.gradle.tooling.events.test.Destination;
import org.gradle.tooling.events.test.JvmTestOperationDescriptor;
import org.gradle.tooling.events.test.TestFailureResult;
import org.gradle.tooling.events.test.TestFinishEvent;
import org.gradle.tooling.events.test.TestOperationDescriptor;
import org.gradle.tooling.events.test.TestOutputDescriptor;
import org.gradle.tooling.events.test.TestOutputEvent;
import org.gradle.tooling.events.test.TestSkippedResult;
import org.gradle.tooling.events.test.TestStartEvent;
import org.gradle.tooling.events.test.TestSuccessResult;
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
	private final Object responseLock = new Object();

	public RunBuildHandler(RunBuildRequest req, StreamObserver<RunBuildReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
		this.progressListener = (ProgressEvent event) -> {
			if (req.getStreamTestEvents() && isTestEvent(event)) {
				replyWithTestEvent(event);
			} else {
				replyWithProgress(event);
			}
		};
		this.standardOutputListener = new ByteBufferOutputStream() {
			@Override
			public void onFlush(byte[] bytes) {
				replyWithStandardOutput(bytes);
			}
		};
		this.standardErrorListener = new ByteBufferOutputStream() {
			@Override
			public void onFlush(byte[] bytes) {
				replyWithStandardError(bytes);
			}
		};
	}

	public void run() {
		GradleBuildRunner gradleRunner = new GradleBuildRunner(req.getProjectDir(), req.getArgsList(),
				req.getGradleConfig(), req.getCancellationKey(), req.getShowOutputColors(), req.getJavaDebugPort(),
				req.getJavaDebugCleanOutputCache(), req.getAdditionalToolOptions(), req.getStreamTestEvents());
		gradleRunner.setProgressListener(progressListener).setStandardOutputStream(standardOutputListener)
				.setStandardErrorStream(standardErrorListener);

		if (!Strings.isNullOrEmpty(req.getInput())) {
			gradleRunner.setStandardInputStream(new ByteArrayInputStream(req.getInput().getBytes()));
		}

		try {
			gradleRunner.run();
			replyWithSuccess();
			completeResponse();
		} catch (BuildCancelledException e) {
			replyWithCancelled(e);
			completeResponse();
		} catch (BuildException | UnsupportedVersionException | UnsupportedBuildArgumentException
				| IllegalStateException | IOException | GradleBuildRunnerException e) {
			logger.error(e.getMessage());
			replyWithError(e);
		}
	}

	public void replyWithCancelled(BuildCancelledException e) {
		sendReply(RunBuildReply.newBuilder()
				.setCancelled(Cancelled.newBuilder().setMessage(e.getMessage()).setProjectDir(req.getProjectDir()))
				.build());
	}

	public void replyWithError(Exception e) {
		synchronized (responseLock) {
			responseObserver.onError(ErrorMessageBuilder.build(e));
		}
	}

	public void replyWithSuccess() {
		sendReply(RunBuildReply.newBuilder()
				.setRunBuildResult(RunBuildResult.newBuilder().setMessage("Successfully run build")).build());
	}

	private void replyWithProgress(ProgressEvent progressEvent) {
		sendReply(RunBuildReply.newBuilder()
				.setProgress(Progress.newBuilder().setMessage(progressEvent.getDisplayName())).build());
	}

	private void replyWithTestEvent(ProgressEvent progressEvent) {
		sendReply(RunBuildReply.newBuilder().setTestEvent(convertTestEvent(progressEvent)).build());
	}

	private void sendReply(RunBuildReply reply) {
		synchronized (responseLock) {
			responseObserver.onNext(reply);
		}
	}

	private void completeResponse() {
		synchronized (responseLock) {
			responseObserver.onCompleted();
		}
	}

	private static boolean isTestEvent(ProgressEvent event) {
		return event instanceof TestStartEvent || event instanceof TestFinishEvent || event instanceof TestOutputEvent;
	}

	private static GradleTestEvent convertTestEvent(ProgressEvent event) {
		GradleTestEvent.Builder builder = GradleTestEvent.newBuilder().setEventTime(event.getEventTime())
				.setDisplayName(event.getDisplayName());

		if (event instanceof TestOutputEvent) {
			TestOutputDescriptor descriptor = ((TestOutputEvent) event).getDescriptor();
			fillDescriptor(builder, descriptor);
			builder.setEventType(GradleTestEvent.EventType.OUTPUT).setMessage(descriptor.getMessage());
			if (Destination.StdOut.equals(descriptor.getDestination())) {
				builder.setOutputDestination(GradleTestEvent.OutputDestination.STDOUT);
			} else if (Destination.StdErr.equals(descriptor.getDestination())) {
				builder.setOutputDestination(GradleTestEvent.OutputDestination.STDERR);
			}
			return builder.build();
		}

		if (event instanceof TestStartEvent) {
			builder.setEventType(GradleTestEvent.EventType.STARTED);
		} else if (event instanceof TestFinishEvent) {
			TestFinishEvent finishEvent = (TestFinishEvent) event;
			if (finishEvent.getResult() instanceof TestSuccessResult) {
				builder.setEventType(GradleTestEvent.EventType.SUCCEEDED);
			} else if (finishEvent.getResult() instanceof TestSkippedResult) {
				builder.setEventType(GradleTestEvent.EventType.SKIPPED);
			} else if (finishEvent.getResult() instanceof TestFailureResult) {
				builder.setEventType(GradleTestEvent.EventType.FAILED);
				String failureMessage = failureMessage((TestFailureResult) finishEvent.getResult());
				if (!failureMessage.isEmpty()) {
					builder.setMessage(failureMessage);
				}
			}
		}

		fillDescriptor(builder, ((org.gradle.tooling.events.test.TestProgressEvent) event).getDescriptor());
		return builder.build();
	}

	private static void fillDescriptor(GradleTestEvent.Builder builder,
			org.gradle.tooling.events.OperationDescriptor descriptor) {
		builder.setId(descriptorPath(descriptor)).setName(descriptor.getName())
				.setDisplayName(descriptor.getDisplayName());
		if (descriptor.getParent() != null) {
			builder.setParentId(descriptorPath(descriptor.getParent()));
		}
		if (descriptor instanceof TestOperationDescriptor) {
			builder.setDisplayName(((TestOperationDescriptor) descriptor).getTestDisplayName());
		}
		if (descriptor instanceof JvmTestOperationDescriptor) {
			JvmTestOperationDescriptor jvmDescriptor = (JvmTestOperationDescriptor) descriptor;
			if (jvmDescriptor.getClassName() != null) {
				builder.setClassName(jvmDescriptor.getClassName());
			}
			if (jvmDescriptor.getMethodName() != null) {
				builder.setMethodName(jvmDescriptor.getMethodName());
			}
			if (jvmDescriptor.getSuiteName() != null) {
				builder.setSuiteName(jvmDescriptor.getSuiteName());
			}
		}
	}

	private static String descriptorPath(org.gradle.tooling.events.OperationDescriptor descriptor) {
		List<String> names = new ArrayList<>();
		org.gradle.tooling.events.OperationDescriptor current = descriptor;
		while (current != null) {
			names.add(current.getName());
			current = current.getParent();
		}
		Collections.reverse(names);
		return String.join("/", names);
	}

	private void replyWithStandardOutput(byte[] bytes) {
		ByteString byteString = ByteString.copyFrom(bytes);
		sendReply(RunBuildReply.newBuilder()
				.setOutput(Output.newBuilder().setOutputType(Output.OutputType.STDOUT).setOutputBytes(byteString))
				.build());
	}

	private void replyWithStandardError(byte[] bytes) {
		ByteString byteString = ByteString.copyFrom(bytes);
		sendReply(RunBuildReply.newBuilder()
				.setOutput(Output.newBuilder().setOutputType(Output.OutputType.STDERR).setOutputBytes(byteString))
				.build());
	}

	private static String failureMessage(TestFailureResult failureResult) {
		List<String> messages = new ArrayList<>();
		for (Failure failure : failureResult.getFailures()) {
			collectFailureMessages(failure, messages);
		}
		return String.join("\n---\n", messages);
	}

	private static void collectFailureMessages(Failure failure, List<String> messages) {
		String message = failure.getMessage();
		String description = failure.getDescription();
		if (!Strings.isNullOrEmpty(message)) {
			messages.add(message);
		}
		if (!Strings.isNullOrEmpty(description) && !description.equals(message)) {
			messages.add(description);
		}
		for (Failure cause : failure.getCauses()) {
			collectFailureMessages(cause, messages);
		}
	}
}
