package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GetProjectDependenciesReply;
import com.github.badsyntax.gradle.GetProjectDependenciesRequest;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.utils.PluginUtils;
import com.google.common.base.Strings;
import com.microsoft.gradle.api.GradleDependencyModelAction;
import com.microsoft.gradle.api.GradleDependencyNode;
import io.grpc.Status;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.gradle.tooling.BuildActionExecuter;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;

public class GetProjectDependenciesHandler {
	private GetProjectDependenciesRequest req;
	private StreamObserver<GetProjectDependenciesReply> responseObserver;

	public GetProjectDependenciesHandler(GetProjectDependenciesRequest req,
			StreamObserver<GetProjectDependenciesReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
	}

	public void run() {
		GradleConnector gradleConnector = GradleProjectConnector.build(req.getProjectDir(), req.getGradleConfig());
		try (ProjectConnection connection = gradleConnector.connect()) {
			BuildActionExecuter<GradleDependencyNode> action = connection
					.action(new GradleDependencyModelAction(req.getProjectPath()));
			List<String> arguments = new ArrayList<>();
			String debugPlugin = System.getenv("VSCODE_DEBUG_PLUGIN");
			if ("true".equals(debugPlugin)) {
				arguments.add("-Dorg.gradle.debug=true");
			}
			File initScript = PluginUtils.getInitScript();
			if (initScript != null) {
				arguments.addAll(Arrays.asList("--init-script", initScript.getAbsolutePath()));
			}
			String jvmArguments = req.getGradleConfig().getJvmArguments();
			arguments.addAll(GradleArguments.parseJvmArguments(jvmArguments));
			action.withArguments(arguments);
			CancellationToken cancellationToken = GradleBuildCancellation.buildToken(req.getCancellationKey());
			action.withCancellationToken(cancellationToken).setColorOutput(req.getShowOutputColors());
			if (!Strings.isNullOrEmpty(req.getGradleConfig().getJavaHome())) {
				action.setJavaHome(new File(req.getGradleConfig().getJavaHome()));
			}
			GradleDependencyNode dependencyNode = action.run();
			if (dependencyNode == null) {
				responseObserver.onError(ErrorMessageBuilder.build(
						new IllegalArgumentException("Cannot find Gradle project: " + req.getProjectPath()),
						Status.NOT_FOUND));
				return;
			}
			responseObserver.onNext(GetProjectDependenciesReply.newBuilder()
					.setDependencyItem(DependencyItemUtils.getDependencyItem(dependencyNode)).build());
			responseObserver.onCompleted();
		} catch (BuildCancelledException e) {
			responseObserver.onError(ErrorMessageBuilder.build(e, Status.CANCELLED));
		} catch (Exception e) {
			responseObserver.onError(ErrorMessageBuilder.build(e));
		} finally {
			GradleBuildCancellation.clearToken(req.getCancellationKey());
		}
	}
}
