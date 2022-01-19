package com.github.badsyntax.gradle;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.powermock.api.mockito.PowerMockito.*;

import io.grpc.ManagedChannel;
import io.grpc.inprocess.InProcessChannelBuilder;
import io.grpc.inprocess.InProcessServerBuilder;
import io.grpc.stub.StreamObserver;
import io.grpc.testing.GrpcCleanupRule;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Set;
import org.gradle.tooling.events.OperationType;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.powermock.core.classloader.annotations.PrepareForTest;
import org.powermock.modules.junit4.PowerMockRunner;

@RunWith(PowerMockRunner.class)
@PrepareForTest(org.gradle.tooling.GradleConnector.class)
@SuppressWarnings(value = "unchecked")
public class GradleServerTest {
	@Rule
	public final GrpcCleanupRule grpcCleanup = new GrpcCleanupRule();

	private GradleServer server;
	private GradleGrpc.GradleStub stub;
	private ManagedChannel inProcessChannel;
	private File mockProjectDir;
	private File mockGradleUserHome;
	private File mockJavaHome;
	private List<String> mockJvmArgs;
	private List<String> mockBuildArgs;

	@Before
	public void setUp() throws Exception {
		String serverName = InProcessServerBuilder.generateName();
		server = new GradleServer(InProcessServerBuilder.forName(serverName).directExecutor(), 0);
		server.start();
		inProcessChannel = grpcCleanup.register(InProcessChannelBuilder.forName(serverName).directExecutor().build());
		mockProjectDir = new File(Files.createTempDirectory("mockProjectDir").toAbsolutePath().toString());
		mockGradleUserHome = new File(Files.createTempDirectory("mockGradleUserHome").toAbsolutePath().toString());
		mockJavaHome = new File("/path/to/jdk");
		mockJvmArgs = new ArrayList<>();
		mockBuildArgs = new ArrayList<>();
		mockBuildArgs.add("test");
		stub = GradleGrpc.newStub(inProcessChannel);
		setupMocks();
	}

	@Mock
	org.gradle.tooling.ModelBuilder<org.gradle.tooling.model.GradleProject> mockGradleProjectBuilder;

	@Mock
	org.gradle.tooling.ModelBuilder<org.gradle.tooling.model.build.BuildEnvironment> mockBuildEnvironmentBuilder;

	@Mock
	org.gradle.tooling.model.DomainObjectSet<? extends org.gradle.tooling.model.GradleProject> mockChildProjects;

	@Mock
	org.gradle.tooling.model.DomainObjectSet<? extends org.gradle.tooling.model.GradleTask> mockTasks;

	@Mock
	org.gradle.tooling.model.GradleProject mockGradleProject;
	@Mock
	org.gradle.tooling.model.build.BuildEnvironment mockBuildEnvironment;
	@Mock
	org.gradle.tooling.GradleConnector mockConnector;
	@Mock
	org.gradle.tooling.ProjectConnection mockConnection;
	@Mock
	org.gradle.tooling.CancellationTokenSource mockCancellationTokenSource;
	@Mock
	org.gradle.tooling.CancellationToken mockCancellationToken;
	@Mock
	org.gradle.tooling.model.build.BuildEnvironment mockEnvironment;
	@Mock
	org.gradle.tooling.model.build.GradleEnvironment mockGradleEnvironment;
	@Mock
	org.gradle.tooling.model.build.JavaEnvironment mockJavaEnvironment;
	@Mock
	org.gradle.tooling.BuildLauncher mockBuildLauncher;

	private void setupMocks() {
		mockStatic(org.gradle.tooling.GradleConnector.class);
		when(org.gradle.tooling.GradleConnector.newConnector()).thenReturn(mockConnector);
		when(org.gradle.tooling.GradleConnector.newCancellationTokenSource()).thenReturn(mockCancellationTokenSource);
		when(mockCancellationTokenSource.token()).thenReturn(mockCancellationToken);
		when(mockConnector.forProjectDirectory(mockProjectDir)).thenReturn(mockConnector);
		when(mockConnector.connect()).thenReturn(mockConnection);

		// Project build (getBuild) mocks
		when(mockGradleEnvironment.getGradleUserHome()).thenReturn(mockGradleUserHome);
		when(mockGradleEnvironment.getGradleVersion()).thenReturn("6.3");
		when(mockJavaEnvironment.getJavaHome()).thenReturn(mockJavaHome);
		when(mockJavaEnvironment.getJvmArguments()).thenReturn(mockJvmArgs);
		when(mockEnvironment.getGradle()).thenReturn(mockGradleEnvironment);
		when(mockEnvironment.getJava()).thenReturn(mockJavaEnvironment);
		when(mockBuildEnvironmentBuilder.get()).thenReturn(mockEnvironment);
		doReturn(mockChildProjects).when(mockGradleProject).getChildren();
		doReturn(mockTasks).when(mockGradleProject).getTasks();
		when(mockGradleProjectBuilder.get()).thenReturn(mockGradleProject);
		when(mockGradleProjectBuilder.withCancellationToken(any())).thenReturn(mockGradleProjectBuilder);
		when(mockBuildEnvironmentBuilder.withCancellationToken(any())).thenReturn(mockBuildEnvironmentBuilder);
		when(mockGradleProjectBuilder.addProgressListener(any(org.gradle.tooling.events.ProgressListener.class),
				ArgumentMatchers.<Set<OperationType>>any())).thenReturn(mockGradleProjectBuilder);
		when(mockBuildEnvironmentBuilder.addProgressListener(any(org.gradle.tooling.events.ProgressListener.class),
				ArgumentMatchers.<Set<OperationType>>any())).thenReturn(mockBuildEnvironmentBuilder);
		when(mockGradleProjectBuilder.setStandardOutput(any(OutputStream.class))).thenReturn(mockGradleProjectBuilder);
		when(mockGradleProjectBuilder.setStandardError(any(OutputStream.class))).thenReturn(mockGradleProjectBuilder);
		when(mockBuildEnvironmentBuilder.setStandardOutput(any(OutputStream.class)))
				.thenReturn(mockBuildEnvironmentBuilder);
		when(mockBuildEnvironmentBuilder.setStandardError(any(OutputStream.class)))
				.thenReturn(mockBuildEnvironmentBuilder);
		when(mockGradleProjectBuilder.setColorOutput(any(Boolean.class))).thenReturn(mockGradleProjectBuilder);
		when(mockConnection.model(org.gradle.tooling.model.GradleProject.class)).thenReturn(mockGradleProjectBuilder);
		when(mockConnection.model(org.gradle.tooling.model.build.BuildEnvironment.class))
				.thenReturn(mockBuildEnvironmentBuilder);

		// Build launcher (run build) mocks
		when(mockBuildLauncher.withCancellationToken(any())).thenReturn(mockBuildLauncher);
		when(mockBuildLauncher.addProgressListener(any(org.gradle.tooling.events.ProgressListener.class),
				ArgumentMatchers.<Set<OperationType>>any())).thenReturn(mockBuildLauncher);
		when(mockBuildLauncher.setStandardOutput(any(OutputStream.class))).thenReturn(mockBuildLauncher);
		when(mockBuildLauncher.setStandardError(any(OutputStream.class))).thenReturn(mockBuildLauncher);
		when(mockBuildLauncher.setColorOutput(any(Boolean.class))).thenReturn(mockBuildLauncher);
		when(mockBuildLauncher.withArguments(any(List.class))).thenReturn(mockBuildLauncher);
		when(mockBuildLauncher.forTasks(any(String.class))).thenReturn(mockBuildLauncher);
		when(mockConnection.newBuild()).thenReturn(mockBuildLauncher);
	}

	@After
	public void tearDown() throws Exception {
		server.stop();
		mockProjectDir.delete();
		mockGradleUserHome.delete();
	}

	@Test
	public void getBuild_shouldSetProjectDirectory() throws IOException {
		StreamObserver<GetBuildReply> mockResponseObserver = (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		stub.getBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockConnector).forProjectDirectory(mockProjectDir);
	}

	@Test
	public void getBuild_shouldUseGradleUserHome() throws IOException {
		StreamObserver<GetBuildReply> mockResponseObserver = (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setUserHome(mockGradleUserHome.getAbsolutePath().toString())
						.setWrapperEnabled(true))
				.build();

		stub.getBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockConnector).useGradleUserHomeDir(mockGradleUserHome);
	}

	@Test
	public void getBuild_shouldUseInternalVersionIfWrapperNotEnabledAndNoVersionAndNoGradleHomeSpecified()
			throws IOException {
		StreamObserver<GetBuildReply> mockResponseObserver = (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false)).build();

		stub.getBuild(req, mockResponseObserver);
		mockResponseObserver.onCompleted();
		verify(mockResponseObserver, never()).onError(any());
		File gradleHomeFile = GradleProjectConnector.getSystemGradleHome();
		if (gradleHomeFile != null) {
			verify(mockConnector).useInstallation(gradleHomeFile);
		} else {
			verify(mockConnector).useGradleVersion(GradleProjectConnector.TOOLING_API_VERSION);
		}
	}

	@Test
	public void getBuild_shouldSetGradleVersionWrapperNotEnabledVersionSpecified() throws Exception {
		StreamObserver<GetBuildReply> mockResponseObserver = (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false).setVersion("6.3")).build();

		stub.getBuild(req, mockResponseObserver);
		mockResponseObserver.onCompleted();
		verify(mockResponseObserver, never()).onError(any());
		verify(mockConnector).useGradleVersion("6.3");
	}

	@Test
	public void getBuild_shouldUseJvmArgs() throws IOException {
		StreamObserver<GetBuildReply> mockResponseObserver = (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

		String jvmArgs = "-Xmx64m -Xms64m";

		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setJvmArguments(jvmArgs).setWrapperEnabled(true)).build();

		stub.getBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildEnvironmentBuilder).setJvmArguments(jvmArgs.split(" "));
	}

	@Test
	public void getBuild_shouldSetColorOutput() throws IOException {
		StreamObserver<GetBuildReply> mockResponseObserver = (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

		GetBuildRequest req1 = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).setShowOutputColors(false).build();

		stub.getBuild(req1, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildEnvironmentBuilder).setColorOutput(false);

		GetBuildRequest req2 = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).setShowOutputColors(true).build();
		stub.getBuild(req2, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildEnvironmentBuilder).setColorOutput(true);
	}

	@Test
	public void getBuild_shouldStreamCorrectProgressEvents() throws IOException {
		StreamObserver<GetBuildReply> mockResponseObserver = (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).setShowOutputColors(true).build();

		ArgumentCaptor<Set<OperationType>> onAddProgressListener = ArgumentCaptor.forClass(Set.class);

		stub.getBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());

		verify(mockBuildEnvironmentBuilder).addProgressListener(any(org.gradle.tooling.events.ProgressListener.class),
				onAddProgressListener.capture());

		assertEquals(1, onAddProgressListener.getValue().size());
		assertTrue(onAddProgressListener.getValue().contains(OperationType.GENERIC));
	}

	@Test
	public void runBuild_shouldSetProjectDirectory() throws IOException {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		stub.runBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockConnector).forProjectDirectory(mockProjectDir);
	}

	@Test
	public void runBuild_shouldUseGradleUserHome() throws IOException {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder()
						.setUserHome(mockGradleUserHome.getAbsolutePath().toString()).setWrapperEnabled(true))
				.build();

		stub.runBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockConnector).useGradleUserHomeDir(mockGradleUserHome);
	}

	@Test
	public void runBuild_shouldUseInternalVersionIfWrapperNotEnabledAndNoVersionAndNoGradleHomeSpecified()
			throws IOException {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false)).build();

		stub.runBuild(req, mockResponseObserver);
		mockResponseObserver.onCompleted();
		verify(mockResponseObserver, never()).onError(any());
		File gradleHomeFile = GradleProjectConnector.getSystemGradleHome();
		if (gradleHomeFile != null) {
			verify(mockConnector).useInstallation(gradleHomeFile);
		} else {
			verify(mockConnector).useGradleVersion(GradleProjectConnector.TOOLING_API_VERSION);
		}
	}

	@Test
	public void runBuild_shouldSetGradleVersionWrapperNotEnabledVersionSpecified() throws Exception {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs)
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false).setVersion("6.3")).build();

		stub.runBuild(req, mockResponseObserver);
		mockResponseObserver.onCompleted();
		verify(mockResponseObserver, never()).onError(any());
		verify(mockConnector).useGradleVersion("6.3");
	}

	@Test
	public void runBuild_shouldUseJvmArgs() throws IOException {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		String jvmArgs = "-Xmx64m -Xms64m";

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs)
				.setGradleConfig(GradleConfig.newBuilder().setJvmArguments(jvmArgs).setWrapperEnabled(true)).build();

		stub.runBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildLauncher).setJvmArguments(jvmArgs);
	}

	@Test
	public void runBuild_shouldSetJwdpEnvironmentVarIfDebug() throws IOException {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setJavaDebugPort(1111).addAllArgs(mockBuildArgs)
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		ArgumentCaptor<HashMap<String, String>> setEnvironmentVariables = ArgumentCaptor.forClass(HashMap.class);

		stub.runBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildLauncher).setEnvironmentVariables(setEnvironmentVariables.capture());
		assertEquals("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:1111",
				setEnvironmentVariables.getValue().get("JAVA_TOOL_OPTIONS"));
	}

	@Test
	public void runBuild_shouldSetStandardInput() throws IOException {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
				.setInput("An input string").build();

		ArgumentCaptor<InputStream> inputStream = ArgumentCaptor.forClass(InputStream.class);

		stub.runBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildLauncher).setStandardInput(inputStream.capture());
		InputStreamReader isReader = new InputStreamReader(inputStream.getValue());
		BufferedReader reader = new BufferedReader(isReader);
		StringBuffer sb = new StringBuffer();
		String str;
		while ((str = reader.readLine()) != null) {
			sb.append(str);
		}
		assertEquals("An input string", sb.toString());
	}

	@Test
	public void runBuild_shouldSetColorOutput() throws IOException {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		RunBuildRequest req1 = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
				.setShowOutputColors(false).build();

		stub.runBuild(req1, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildLauncher).setColorOutput(false);

		RunBuildRequest req2 = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
				.setShowOutputColors(true).build();

		stub.runBuild(req2, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildLauncher).setColorOutput(true);
	}

	@Test
	public void runBuild_shouldStreamCorrectProgressEvents() throws IOException {
		StreamObserver<RunBuildReply> mockResponseObserver = (StreamObserver<RunBuildReply>) mock(StreamObserver.class);

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
				.setShowOutputColors(true).build();

		ArgumentCaptor<Set<OperationType>> onAddProgressListener = ArgumentCaptor.forClass(Set.class);

		stub.runBuild(req, mockResponseObserver);
		verify(mockResponseObserver, never()).onError(any());
		verify(mockBuildLauncher).addProgressListener(any(org.gradle.tooling.events.ProgressListener.class),
				onAddProgressListener.capture());

		assertEquals(3, onAddProgressListener.getValue().size());
		assertTrue(onAddProgressListener.getValue().contains(OperationType.PROJECT_CONFIGURATION));
		assertTrue(onAddProgressListener.getValue().contains(OperationType.TASK));
		assertTrue(onAddProgressListener.getValue().contains(OperationType.TRANSFORM));
	}
}
