package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.ByteBufferOutputStream;
import com.github.badsyntax.gradle.Cancelled;
import com.github.badsyntax.gradle.DependencyItem;
import com.github.badsyntax.gradle.Environment;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GetBuildReply;
import com.github.badsyntax.gradle.GetBuildRequest;
import com.github.badsyntax.gradle.GetBuildResult;
import com.github.badsyntax.gradle.GradleBuild;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.GradleEnvironment;
import com.github.badsyntax.gradle.GradleProject;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.GradleTask;
import com.github.badsyntax.gradle.GrpcGradleClosure;
import com.github.badsyntax.gradle.GrpcGradleField;
import com.github.badsyntax.gradle.GrpcGradleMethod;
import com.github.badsyntax.gradle.JavaEnvironment;
import com.github.badsyntax.gradle.Output;
import com.github.badsyntax.gradle.Progress;
import com.github.badsyntax.gradle.utils.PluginUtils;
import com.github.badsyntax.gradle.utils.Utils;
import com.google.common.base.Strings;
import com.google.protobuf.ByteString;
import com.microsoft.gradle.api.GradleClosure;
import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleField;
import com.microsoft.gradle.api.GradleMethod;
import com.microsoft.gradle.api.GradleModelAction;
import com.microsoft.gradle.api.GradleProjectModel;
import io.github.g00fy2.versioncompare.Version;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.gradle.internal.service.ServiceCreationException;
import org.gradle.tooling.BuildActionExecuter;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.GradleConnectionException;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.events.OperationType;
import org.gradle.tooling.events.ProgressEvent;
import org.gradle.tooling.events.ProgressListener;
import org.gradle.tooling.model.build.BuildEnvironment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GetBuildHandler {
	private static final Logger logger = LoggerFactory.getLogger(GetBuildHandler.class.getName());

	private GetBuildRequest req;
	private StreamObserver<GetBuildReply> responseObserver;
	private ProgressListener progressListener;
	private ByteBufferOutputStream standardOutputListener;
	private ByteBufferOutputStream standardErrorListener;
	private Environment environment;

	public GetBuildHandler(GetBuildRequest req, StreamObserver<GetBuildReply> responseObserver) {
		this.req = req;
		this.responseObserver = responseObserver;
		this.progressListener = (ProgressEvent event) -> {
			synchronized (GetBuildHandler.class) {
				replyWithProgress(event);
			}
		};
		this.standardOutputListener = new ByteBufferOutputStream() {
			@Override
			public void onFlush(byte[] bytes) {
				synchronized (GetBuildHandler.class) {
					replyWithStandardOutput(bytes);
				}
			}
		};
		this.standardErrorListener = new ByteBufferOutputStream() {
			@Override
			public void onFlush(byte[] bytes) {
				synchronized (GetBuildHandler.class) {
					replyWithStandardError(bytes);
				}
			}
		};
	}

	public void run() {
		GradleConnector gradleConnector = GradleProjectConnector.build(req.getProjectDir(), req.getGradleConfig());
		try (ProjectConnection connection = gradleConnector.connect()) {
			this.environment = buildEnvironment(connection);
			replyWithBuildEnvironment(this.environment);
			BuildActionExecuter<GradleProjectModel> action = connection.action(new GradleModelAction());
			if (action == null) {
				responseObserver.onCompleted();
				return;
			}
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
			if (!Strings.isNullOrEmpty(jvmArguments)) {
				arguments.addAll(Arrays.stream(jvmArguments.split(" ")).filter(e -> e != null && !e.isEmpty())
						.collect(Collectors.toList()));
			}
			action.withArguments(arguments);
			CancellationToken cancellationToken = GradleBuildCancellation.buildToken(req.getCancellationKey());
			Set<OperationType> progressEvents = new HashSet<>();
			progressEvents.add(OperationType.PROJECT_CONFIGURATION);
			action.withCancellationToken(cancellationToken).addProgressListener(progressListener, progressEvents)
					.setStandardOutput(standardOutputListener).setStandardError(standardErrorListener)
					.setColorOutput(req.getShowOutputColors());
			if (!Strings.isNullOrEmpty(req.getGradleConfig().getJavaHome())) {
				action.setJavaHome(new File(req.getGradleConfig().getJavaHome()));
			}
			GradleProjectModel gradleModel = action.run();
			if (gradleModel == null) {
				throw new Exception("Error occurs in querying custom model.");
			}
			GradleProject project = getProjectData(gradleModel);
			replyWithProject(project);
		} catch (BuildCancelledException e) {
			replyWithCancelled(e);
		} catch (ServiceCreationException | IllegalStateException | GradleConnectionException e) {
			String javaExtensionVersion = req.getGradleConfig().getJavaExtensionVersion();
			boolean shouldCheckCompatibility = !(javaExtensionVersion != null
					&& new Version(javaExtensionVersion).isAtLeast("1.3.0"));
			if (shouldCheckCompatibility) {
				if (this.environment != null) {
					Version gradleVersion = new Version(this.environment.getGradleEnvironment().getGradleVersion());
					Version javaVersion = new Version(System.getProperty("java.version"));
					if (Utils.hasCompatibilityError(gradleVersion, javaVersion)) {
						replyWithCompatibilityCheckError(gradleVersion.getOriginalString(),
								javaVersion.getOriginalString());
					}
				} else {
					String rootCause = getRootCause(e);
					if (rootCause.contains("Could not determine java version")) {
						// Current Gradle version requires no more than Java 8.
						// Since the language server requires JDK11+,
						// We recommend the user to change gradle settings
						replyWithCompatibilityCheckError();
					}
				}
			}
			logger.error(e.getMessage());
			replyWithError(e);
		} catch (Exception e) {
			replyWithError(e);
		} finally {
			GradleBuildCancellation.clearToken(req.getCancellationKey());
		}
	}

	private String getRootCause(Throwable error) {
		Throwable rootCause = error;
		while (true) {
			Throwable cause = rootCause.getCause();
			if (cause == null || cause.getMessage() == null && !(cause instanceof StackOverflowError)) {
				break;
			}
			rootCause = cause;
		}
		return rootCause.toString();
	}

	private Environment buildEnvironment(ProjectConnection connection) {
		ModelBuilder<BuildEnvironment> buildEnvironment = connection.model(BuildEnvironment.class);

		Set<OperationType> progressEvents = new HashSet<>();
		progressEvents.add(OperationType.GENERIC);

		CancellationToken cancellationToken = GradleBuildCancellation.buildToken(req.getCancellationKey());

		buildEnvironment.withCancellationToken(cancellationToken).addProgressListener(progressListener, progressEvents)
				.setStandardOutput(standardOutputListener).setStandardError(standardErrorListener)
				.setColorOutput(req.getShowOutputColors());
		String jvmArguments = req.getGradleConfig().getJvmArguments();
		if (!Strings.isNullOrEmpty(jvmArguments)) {
			buildEnvironment.setJvmArguments(Arrays.stream(jvmArguments.split(" "))
					.filter(e -> e != null && !e.isEmpty()).toArray(String[]::new));
		}

		try {
			BuildEnvironment environment = buildEnvironment.get();
			org.gradle.tooling.model.build.GradleEnvironment gradleEnvironment = environment.getGradle();
			org.gradle.tooling.model.build.JavaEnvironment javaEnvironment = environment.getJava();
			String javaHome = Strings.isNullOrEmpty(req.getGradleConfig().getJavaHome())
					? javaEnvironment.getJavaHome().getAbsolutePath()
					: req.getGradleConfig().getJavaHome();
			return Environment.newBuilder()
					.setGradleEnvironment(GradleEnvironment.newBuilder()
							.setGradleUserHome(gradleEnvironment.getGradleUserHome().getAbsolutePath())
							.setGradleVersion(gradleEnvironment.getGradleVersion()))
					.setJavaEnvironment(JavaEnvironment.newBuilder().setJavaHome(javaHome)
							.addAllJvmArgs(javaEnvironment.getJvmArguments()))
					.build();
		} finally {
			GradleBuildCancellation.clearToken(req.getCancellationKey());
		}
	}

	private GradleProject getProjectData(GradleProjectModel gradleModel) {
		GradleProject.Builder project = GradleProject.newBuilder();
		project.setIsRoot(gradleModel.getIsRoot());
		project.addAllTasks(getGradleTasks(gradleModel));
		List<GradleProject> subProjects = new ArrayList<>();
		for (GradleProjectModel subProjectModel : gradleModel.getSubProjects()) {
			subProjects.add(getProjectData(subProjectModel));
		}
		project.addAllProjects(subProjects);
		project.setProjectPath(gradleModel.getProjectPath());
		project.setDependencyItem(getDependencyItem(gradleModel.getDependencyNode()));
		project.addAllPlugins(gradleModel.getPlugins());
		project.addAllPluginClosures(getPluginClosures(gradleModel));
		project.addAllScriptClasspaths(gradleModel.getScriptClasspaths());
		return project.build();
	}

	private List<GradleTask> getGradleTasks(GradleProjectModel model) {
		List<GradleTask> tasks = new ArrayList<>();
		model.getTasks().forEach(task -> {
			GradleTask.Builder builder = GradleTask.newBuilder();
			builder.setName(task.getName()).setPath(task.getPath()).setProject(task.getProject())
					.setBuildFile(task.getBuildFile()).setRootProject(task.getRootProject())
					.setDebuggable(task.getDebuggable());
			String group = task.getGroup();
			if (group != null) {
				builder.setGroup(group);
			}
			String description = task.getDescription();
			if (description != null) {
				builder.setDescription(description);
			}
			tasks.add(builder.build());
		});
		return tasks;
	}

	private DependencyItem getDependencyItem(GradleDependencyNode node) {
		DependencyItem.Builder item = DependencyItem.newBuilder();
		item.setName(node.getName());
		item.setTypeValue(node.getType().ordinal());
		if (node.getChildren() == null) {
			return item.build();
		}
		List<DependencyItem> children = new ArrayList<>();
		for (GradleDependencyNode child : node.getChildren()) {
			children.add(getDependencyItem(child));
		}
		item.addAllChildren(children);
		return item.build();
	}

	private List<GrpcGradleClosure> getPluginClosures(GradleProjectModel model) {
		List<GrpcGradleClosure> closures = new ArrayList<>();
		for (GradleClosure closure : model.getClosures()) {
			GrpcGradleClosure.Builder closureBuilder = GrpcGradleClosure.newBuilder();
			for (GradleMethod method : closure.getMethods()) {
				GrpcGradleMethod.Builder methodBuilder = GrpcGradleMethod.newBuilder();
				methodBuilder.setName(method.getName());
				methodBuilder.addAllParameterTypes(method.getParameterTypes());
				methodBuilder.setDeprecated(method.getDeprecated());
				closureBuilder.addMethods(methodBuilder.build());
			}
			closureBuilder.setName(closure.getName());
			for (GradleField field : closure.getFields()) {
				GrpcGradleField.Builder fieldBuilder = GrpcGradleField.newBuilder();
				fieldBuilder.setName(field.getName());
				fieldBuilder.setDeprecated(field.getDeprecated());
				closureBuilder.addFields(fieldBuilder.build());
			}
			closures.add(closureBuilder.build());
		}
		return closures;
	}

	private void replyWithProject(GradleProject gradleProject) {
		responseObserver.onNext(GetBuildReply.newBuilder()
				.setGetBuildResult(
						GetBuildResult.newBuilder().setBuild(GradleBuild.newBuilder().setProject(gradleProject)))
				.build());
		responseObserver.onCompleted();
	}

	private void replyWithCancelled(BuildCancelledException e) {
		responseObserver.onNext(GetBuildReply.newBuilder()
				.setCancelled(Cancelled.newBuilder().setMessage(e.getMessage()).setProjectDir(req.getProjectDir()))
				.build());
		responseObserver.onCompleted();
	}

	private void replyWithError(Exception e) {
		responseObserver.onError(ErrorMessageBuilder.build(e));
	}

	private void replyWithBuildEnvironment(Environment environment) {
		responseObserver.onNext(GetBuildReply.newBuilder().setEnvironment(environment).build());
	}

	private void replyWithProgress(ProgressEvent progressEvent) {
		responseObserver.onNext(GetBuildReply.newBuilder()
				.setProgress(Progress.newBuilder().setMessage(progressEvent.getDisplayName())).build());
	}

	private void replyWithStandardOutput(byte[] bytes) {
		ByteString byteString = ByteString.copyFrom(bytes);
		responseObserver.onNext(GetBuildReply.newBuilder()
				.setOutput(Output.newBuilder().setOutputType(Output.OutputType.STDOUT).setOutputBytes(byteString))
				.build());
	}

	private void replyWithStandardError(byte[] bytes) {
		ByteString byteString = ByteString.copyFrom(bytes);
		responseObserver.onNext(GetBuildReply.newBuilder()
				.setOutput(Output.newBuilder().setOutputType(Output.OutputType.STDERR).setOutputBytes(byteString))
				.build());
	}

	private void replyWithCompatibilityCheckError(String gradleVersion, String javaVersion) {
		String errorMessage = "Could not use Gradle version " + gradleVersion + " and Java version " + javaVersion
				+ " to configure the build. Please consider either to change your Java Runtime or your Gradle settings.";
		responseObserver.onNext(GetBuildReply.newBuilder().setCompatibilityCheckError(errorMessage).build());
	}

	private void replyWithCompatibilityCheckError() {
		String errorMessage = "The current Gradle version requires Java 8 or lower. Please consider to change your Gradle settings.";
		responseObserver.onNext(GetBuildReply.newBuilder().setCompatibilityCheckError(errorMessage).build());
	}
}
