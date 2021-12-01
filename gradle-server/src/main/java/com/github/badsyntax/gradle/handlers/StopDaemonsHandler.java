package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GradleExecution;
import com.github.badsyntax.gradle.GradleLocalInstallation;
import com.github.badsyntax.gradle.GradleProjectConnectionType;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.GradleWrapper;
import com.github.badsyntax.gradle.StopDaemonsReply;
import com.github.badsyntax.gradle.StopDaemonsRequest;
import com.github.badsyntax.gradle.exceptions.GradleExecutionException;
import io.grpc.stub.StreamObserver;
import java.io.File;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class StopDaemonsHandler {
	private static final Logger logger = LoggerFactory.getLogger(StopDaemonsHandler.class.getName());

	private StopDaemonsRequest req;
	private StreamObserver<StopDaemonsReply> responseObserver;

	public StopDaemonsHandler(StopDaemonsRequest req, StreamObserver<StopDaemonsReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
	}

	public void run() {
		File projectRoot = new File(req.getProjectDir());
		try {
			GradleExecution gradleExecution = null;
			GradleProjectConnectionType connectionType = GradleProjectConnector.getConnectionType();
			if (connectionType == GradleProjectConnectionType.WRAPPER) {
				if (!GradleWrapper.hasValidWrapper(projectRoot)) {
					// When java.import.gradle.wrapper.enabled is set to true but no wrapper
					// properties file
					// is found,
					// We'll show no daemon status, so stopping a daemon in this case is not
					// supported.
					replyWithError(new Exception("Unsupported operation."));
					return;
				}
				gradleExecution = new GradleWrapper(projectRoot);
			} else if (connectionType == GradleProjectConnectionType.LOCALINSTALLATION) {
				String localInstallation = GradleProjectConnector.getLocalInstallation();
				gradleExecution = new GradleLocalInstallation(new File(localInstallation));
			} else if (connectionType == GradleProjectConnectionType.SPECIFICVERSION) {
				// We disabled stop all daemons in the client when specifies a gradle version
				// So here will not be reached
				replyWithError(new Exception("Unsupported operation."));
				return;
			}
			if (gradleExecution == null) {
				replyWithError(new Exception("Stop daemons failed. Please check your Gradle Settings."));
				return;
			}
			String stopOutput = gradleExecution.exec("--stop");
			replyWithSuccess(stopOutput);
			responseObserver.onCompleted();
		} catch (GradleExecutionException e) {
			logger.error(e.getMessage());
			replyWithError(e);
		}
	}

	private void replyWithError(Exception e) {
		responseObserver.onError(ErrorMessageBuilder.build(e));
	}

	private void replyWithSuccess(String message) {
		responseObserver.onNext(StopDaemonsReply.newBuilder().setMessage(message).build());
	}
}
