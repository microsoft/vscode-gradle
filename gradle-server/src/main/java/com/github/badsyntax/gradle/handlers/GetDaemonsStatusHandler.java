package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.DaemonInfo;
import com.github.badsyntax.gradle.DaemonStatus;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GetDaemonsStatusReply;
import com.github.badsyntax.gradle.GetDaemonsStatusRequest;
import com.github.badsyntax.gradle.GradleLocalInstallation;
import com.github.badsyntax.gradle.GradleProjectConnectionType;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.GradleWrapper;
import com.github.badsyntax.gradle.exceptions.GradleExecutionException;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GetDaemonsStatusHandler {
	private static final Logger logger = LoggerFactory.getLogger(GetDaemonsStatusHandler.class.getName());

	private GetDaemonsStatusRequest req;
	private StreamObserver<GetDaemonsStatusReply> responseObserver;

	public GetDaemonsStatusHandler(GetDaemonsStatusRequest req,
			StreamObserver<GetDaemonsStatusReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
	}

	public synchronized void run() {
		DaemonStatus daemonStatus = null;
		GradleProjectConnectionType connectionType = GradleProjectConnector.getConnectionType();
		if (connectionType == GradleProjectConnectionType.WRAPPER) {
			File projectRoot = new File(req.getProjectDir());
			// get daemon status needs to use wrapper execution
			// when java.import.gradle.wrapper.enabled is set to true
			if (!GradleWrapper.hasValidWrapper(projectRoot)) {
				replyWithSuccess(new ArrayList<>());
				return;
			}
			GradleWrapper gradleWrapper = new GradleWrapper(projectRoot);
			daemonStatus = new DaemonStatus(gradleWrapper);
		} else if (connectionType == GradleProjectConnectionType.LOCALINSTALLATION) {
			String localInstallation = GradleProjectConnector.getLocalInstallation();
			GradleLocalInstallation gradleLocalInstallation = new GradleLocalInstallation(new File(localInstallation));
			daemonStatus = new DaemonStatus(gradleLocalInstallation);
		} else if (connectionType == GradleProjectConnectionType.SPECIFICVERSION) {
			// Currently we can't find a way to get daemon status of specific version
			// We can neither get the executable path of this case, so return an empty list
			// to indicate
			replyWithSuccess(new ArrayList<>());
			return;
		}
		if (daemonStatus == null) {
			replyWithError(new Exception("Get daemon status failed. Please check your Gradle Settings."));
			return;
		}
		try {
			List<DaemonInfo> status = daemonStatus.get();
			replyWithSuccess(status);
		} catch (GradleExecutionException e) {
			logger.error(e.getMessage());
			replyWithError(e);
		}
	}

	public void replyWithError(Exception e) {
		responseObserver.onError(ErrorMessageBuilder.build(e));
	}

	public void replyWithSuccess(List<DaemonInfo> status) {
		responseObserver.onNext(GetDaemonsStatusReply.newBuilder().addAllDaemonInfo(status).build());
		responseObserver.onCompleted();
	}
}
