package com.github.badsyntax.gradle;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.powermock.api.mockito.PowerMockito.*;

import com.github.badsyntax.gradle.handlers.GetBuildHandler;
import com.github.badsyntax.gradle.handlers.RunBuildHandler;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleClient;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleResponse;
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
import java.util.concurrent.CompletableFuture;
import org.gradle.tooling.events.OperationType;
import org.junit.After;
import org.junit.Before;
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
	private File mockProjectDir;
	private File mockGradleUserHome;
	private File mockJavaHome;
	private List<String> mockJvmArgs;
	private List<String> mockBuildArgs;

	private GradleClient mockClient;

	@Before
	public void setUp() throws Exception {
		mockProjectDir = new File(Files.createTempDirectory("mockProjectDir").toAbsolutePath().toString());
		mockGradleUserHome = new File(Files.createTempDirectory("mockGradleUserHome").toAbsolutePath().toString());
		mockJavaHome = new File("/path/to/jdk");
		mockJvmArgs = new ArrayList<>();
		mockBuildArgs = new ArrayList<>();
		mockBuildArgs.add("test");
		mockClient = mock(GradleClient.class);
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
		mockProjectDir.delete();
		mockGradleUserHome.delete();
	}

	private CompletableFuture<GradleResponse> runGetBuild(GetBuildRequest req) {
		CompletableFuture<GradleResponse> future = new CompletableFuture<>();
		new GetBuildHandler(req, future, mockClient, 1L).run();
		return future;
	}

	private CompletableFuture<GradleResponse> runRunBuild(RunBuildRequest req) {
		CompletableFuture<GradleResponse> future = new CompletableFuture<>();
		new RunBuildHandler(req, future, mockClient, 1L).run();
		return future;
	}

	private static void assertSuccess(CompletableFuture<GradleResponse> future) {
		assertFalse("Handler future completed exceptionally: " + (future.isCompletedExceptionally() ? future : ""),
				future.isCompletedExceptionally());
	}

	@Test
	public void getBuild_shouldSetProjectDirectory() throws IOException {
		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		assertSuccess(runGetBuild(req));
		verify(mockConnector).forProjectDirectory(mockProjectDir);
	}

	@Test
	public void getBuild_shouldUseGradleUserHome() throws IOException {
		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setUserHome(mockGradleUserHome.getAbsolutePath().toString())
						.setWrapperEnabled(true))
				.build();

		assertSuccess(runGetBuild(req));
		verify(mockConnector).useGradleUserHomeDir(mockGradleUserHome);
	}

	@Test
	public void getBuild_shouldUseInternalVersionIfWrapperNotEnabledAndNoVersionAndNoGradleHomeSpecified()
			throws IOException {
		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false)).build();

		assertSuccess(runGetBuild(req));
		File gradleHomeFile = GradleProjectConnector.getSystemGradleHome();
		if (gradleHomeFile != null) {
			verify(mockConnector).useInstallation(gradleHomeFile);
		} else {
			verify(mockConnector).useGradleVersion(GradleProjectConnector.TOOLING_API_VERSION);
		}
	}

	@Test
	public void getBuild_shouldSetGradleVersionWrapperNotEnabledVersionSpecified() throws Exception {
		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false).setVersion("6.3")).build();

		assertSuccess(runGetBuild(req));
		verify(mockConnector).useGradleVersion("6.3");
	}

	@Test
	public void getBuild_shouldUseJvmArgs() throws IOException {
		String jvmArgs = "-Xmx64m -Xms64m";

		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setJvmArguments(jvmArgs).setWrapperEnabled(true)).build();

		assertSuccess(runGetBuild(req));
		verify(mockBuildEnvironmentBuilder).setJvmArguments(jvmArgs.split(" "));
	}

	@Test
	public void getBuild_shouldSetColorOutput() throws IOException {
		GetBuildRequest req1 = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).setShowOutputColors(false).build();

		assertSuccess(runGetBuild(req1));
		verify(mockBuildEnvironmentBuilder).setColorOutput(false);

		GetBuildRequest req2 = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).setShowOutputColors(true).build();
		assertSuccess(runGetBuild(req2));
		verify(mockBuildEnvironmentBuilder).setColorOutput(true);
	}

	@Test
	public void getBuild_shouldStreamCorrectProgressEvents() throws IOException {
		GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).setShowOutputColors(true).build();

		ArgumentCaptor<Set<OperationType>> onAddProgressListener = ArgumentCaptor.forClass(Set.class);

		assertSuccess(runGetBuild(req));

		verify(mockBuildEnvironmentBuilder).addProgressListener(any(org.gradle.tooling.events.ProgressListener.class),
				onAddProgressListener.capture());

		assertEquals(1, onAddProgressListener.getValue().size());
		assertTrue(onAddProgressListener.getValue().contains(OperationType.GENERIC));
	}

	@Test
	public void runBuild_shouldSetProjectDirectory() throws IOException {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		assertSuccess(runRunBuild(req));
		verify(mockConnector).forProjectDirectory(mockProjectDir);
	}

	@Test
	public void runBuild_shouldUseGradleUserHome() throws IOException {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder()
						.setUserHome(mockGradleUserHome.getAbsolutePath().toString()).setWrapperEnabled(true))
				.build();

		assertSuccess(runRunBuild(req));
		verify(mockConnector).useGradleUserHomeDir(mockGradleUserHome);
	}

	@Test
	public void runBuild_shouldUseInternalVersionIfWrapperNotEnabledAndNoVersionAndNoGradleHomeSpecified()
			throws IOException {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false)).build();

		assertSuccess(runRunBuild(req));
		File gradleHomeFile = GradleProjectConnector.getSystemGradleHome();
		if (gradleHomeFile != null) {
			verify(mockConnector).useInstallation(gradleHomeFile);
		} else {
			verify(mockConnector).useGradleVersion(GradleProjectConnector.TOOLING_API_VERSION);
		}
	}

	@Test
	public void runBuild_shouldSetGradleVersionWrapperNotEnabledVersionSpecified() throws Exception {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs)
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false).setVersion("6.3")).build();

		assertSuccess(runRunBuild(req));
		verify(mockConnector).useGradleVersion("6.3");
	}

	@Test
	public void runBuild_shouldUseJvmArgs() throws IOException {
		String jvmArgs = "-Xmx64m -Xms64m";

		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs)
				.setGradleConfig(GradleConfig.newBuilder().setJvmArguments(jvmArgs).setWrapperEnabled(true)).build();

		assertSuccess(runRunBuild(req));
		verify(mockBuildLauncher).setJvmArguments(jvmArgs);
	}

	@Test
	public void runBuild_shouldUseInitScriptForDebug() throws IOException {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setJavaDebugPort(1111).addAllArgs(mockBuildArgs)
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		ArgumentCaptor<List<String>> argumentsCaptor = ArgumentCaptor.forClass(List.class);

		assertSuccess(runRunBuild(req));
		verify(mockBuildLauncher).withArguments(argumentsCaptor.capture());

		List<String> capturedArgs = argumentsCaptor.getValue();
		assertTrue("Expected --init-script argument for debugging", capturedArgs.contains("--init-script"));
		int initScriptIndex = capturedArgs.indexOf("--init-script");
		assertTrue("Expected argument after --init-script", capturedArgs.size() > initScriptIndex + 1);
		assertTrue("Init script path should contain vscode-gradle-debug-init",
				capturedArgs.get(initScriptIndex + 1).contains("vscode-gradle-debug-init"));

		assertTrue("Expected -Dvscode.debug.port argument", capturedArgs.contains("-Dvscode.debug.port=1111"));

		verify(mockBuildLauncher, never()).setEnvironmentVariables(any());
	}

	@Test
	public void runBuild_shouldSetToolOptionsVar() throws IOException {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setAdditionalToolOptions("-agentpath:test").addAllArgs(mockBuildArgs)
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		ArgumentCaptor<HashMap<String, String>> setEnvironmentVariables = ArgumentCaptor.forClass(HashMap.class);

		assertSuccess(runRunBuild(req));
		verify(mockBuildLauncher).setEnvironmentVariables(setEnvironmentVariables.capture());
		assertEquals("-agentpath:test", setEnvironmentVariables.getValue().get("JAVA_TOOL_OPTIONS"));
	}

	@Test
	public void runBuild_shouldSetToolOptionsVarWithDebug() throws IOException {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.setAdditionalToolOptions("-agentpath:test").setJavaDebugPort(1111).addAllArgs(mockBuildArgs)
				.setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true)).build();

		ArgumentCaptor<HashMap<String, String>> setEnvironmentVariables = ArgumentCaptor.forClass(HashMap.class);
		ArgumentCaptor<List<String>> argumentsCaptor = ArgumentCaptor.forClass(List.class);

		assertSuccess(runRunBuild(req));

		verify(mockBuildLauncher).withArguments(argumentsCaptor.capture());
		List<String> capturedArgs = argumentsCaptor.getValue();
		assertTrue("Expected --init-script argument for debugging", capturedArgs.contains("--init-script"));
		assertTrue("Expected -Dvscode.debug.port argument", capturedArgs.contains("-Dvscode.debug.port=1111"));

		verify(mockBuildLauncher).setEnvironmentVariables(setEnvironmentVariables.capture());
		assertEquals("-agentpath:test", setEnvironmentVariables.getValue().get("JAVA_TOOL_OPTIONS"));
	}

	@Test
	public void runBuild_shouldSetStandardInput() throws IOException {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
				.setInput("An input string").build();

		ArgumentCaptor<InputStream> inputStream = ArgumentCaptor.forClass(InputStream.class);

		assertSuccess(runRunBuild(req));
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
		RunBuildRequest req1 = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
				.setShowOutputColors(false).build();

		assertSuccess(runRunBuild(req1));
		verify(mockBuildLauncher).setColorOutput(false);

		RunBuildRequest req2 = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
				.setShowOutputColors(true).build();

		assertSuccess(runRunBuild(req2));
		verify(mockBuildLauncher).setColorOutput(true);
	}

	@Test
	public void runBuild_shouldStreamCorrectProgressEvents() throws IOException {
		RunBuildRequest req = RunBuildRequest.newBuilder().setProjectDir(mockProjectDir.getAbsolutePath().toString())
				.addAllArgs(mockBuildArgs).setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
				.setShowOutputColors(true).build();

		ArgumentCaptor<Set<OperationType>> onAddProgressListener = ArgumentCaptor.forClass(Set.class);

		assertSuccess(runRunBuild(req));
		verify(mockBuildLauncher).addProgressListener(any(org.gradle.tooling.events.ProgressListener.class),
				onAddProgressListener.capture());

		assertEquals(3, onAddProgressListener.getValue().size());
		assertTrue(onAddProgressListener.getValue().contains(OperationType.PROJECT_CONFIGURATION));
		assertTrue(onAddProgressListener.getValue().contains(OperationType.TASK));
		assertTrue(onAddProgressListener.getValue().contains(OperationType.TRANSFORM));
	}
}
