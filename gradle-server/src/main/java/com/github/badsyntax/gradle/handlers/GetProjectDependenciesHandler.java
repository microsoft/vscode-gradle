package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.GetProjectDependenciesReply;
import com.github.badsyntax.gradle.GetProjectDependenciesRequest;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.transport.TaskException;
import com.github.badsyntax.gradle.transport.TaskReplySink;
import com.github.badsyntax.gradle.utils.PluginUtils;
import com.google.common.base.Strings;
import com.microsoft.gradle.api.GradleDependencyModelAction;
import com.microsoft.gradle.api.GradleDependencyNode;
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
	private TaskReplySink<GetProjectDependenciesReply> sink;

	public GetProjectDependenciesHandler(GetProjectDependenciesRequest req,
			TaskReplySink<GetProjectDependenciesReply> sink) {
		this.req = req;
		this.sink = sink;
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
				String message = "Cannot find Gradle project: " + req.getProjectPath();
				sink.onError(new TaskException(TaskException.Type.NOT_FOUND, message,
						new IllegalArgumentException(message)));
				return;
			}
			sink.onNext(GetProjectDependenciesReply.newBuilder()
					.setDependencyItem(DependencyItemUtils.getDependencyItem(dependencyNode)).build());
			sink.onCompleted();
		} catch (BuildCancelledException e) {
			sink.onError(new TaskException(TaskException.Type.CANCELLED, e.getMessage(), e));
		} catch (Exception e) {
			sink.onError(new TaskException(TaskException.Type.INTERNAL, e.getMessage(), e));
		} finally {
			GradleBuildCancellation.clearToken(req.getCancellationKey());
		}
	}
}
