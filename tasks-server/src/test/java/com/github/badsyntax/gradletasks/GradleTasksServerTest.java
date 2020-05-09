package com.github.badsyntax.gradletasks;

import static org.junit.Assert.assertEquals;
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
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.powermock.core.classloader.annotations.PrepareForTest;
import org.powermock.modules.junit4.PowerMockRunner;

@RunWith(PowerMockRunner.class)
@PrepareForTest(org.gradle.tooling.GradleConnector.class)
@SuppressWarnings(value = "unchecked")
public class GradleTasksServerTest {
  @Rule public final GrpcCleanupRule grpcCleanup = new GrpcCleanupRule();

  private GradleTasksServer server;
  private ManagedChannel inProcessChannel;
  private File mockProjectDir;
  private File mockGradleUserHome;
  private File mockJavaHome;
  private List<String> mockJvmArgs;

  @Before
  public void setUp() throws Exception {
    String serverName = InProcessServerBuilder.generateName();
    server = new GradleTasksServer(InProcessServerBuilder.forName(serverName).directExecutor(), 0);
    server.start();
    inProcessChannel =
        grpcCleanup.register(InProcessChannelBuilder.forName(serverName).directExecutor().build());
    mockProjectDir =
        new File(Files.createTempDirectory("mockProjectDir").toAbsolutePath().toString());
    mockGradleUserHome =
        new File(Files.createTempDirectory("mockGradleUserHome").toAbsolutePath().toString());
    mockJavaHome = new File("/path/to/jdk");
    mockJvmArgs = new ArrayList<>();
    setupMocks();
  }

  @Mock
  org.gradle.tooling.ModelBuilder<org.gradle.tooling.model.GradleProject> mockGradleProjectBuilder;

  @Mock org.gradle.tooling.model.GradleProject mockGradleProject;
  @Mock org.gradle.tooling.GradleConnector mockConnector;
  @Mock org.gradle.tooling.ProjectConnection mockConnection;
  @Mock org.gradle.tooling.CancellationTokenSource mockCancellationTokenSource;
  @Mock org.gradle.tooling.CancellationToken mockCancellationToken;
  @Mock org.gradle.tooling.model.build.BuildEnvironment mockEnvironment;
  @Mock org.gradle.tooling.model.build.GradleEnvironment mockGradleEnvironment;
  @Mock org.gradle.tooling.model.build.JavaEnvironment mockJavaEnvironment;
  @Mock org.gradle.tooling.BuildLauncher mockBuildLauncher;

  @Mock
  org.gradle.tooling.ModelBuilder<org.gradle.tooling.model.build.BuildEnvironment>
      mockBuildEnvironmentBuilder;

  @Mock
  org.gradle.tooling.model.DomainObjectSet<? extends org.gradle.tooling.model.GradleProject>
      mockChildProjects;

  @Mock
  org.gradle.tooling.model.DomainObjectSet<? extends org.gradle.tooling.model.GradleTask> mockTasks;

  private void setupMocks() {
    mockStatic(org.gradle.tooling.GradleConnector.class);
    when(org.gradle.tooling.GradleConnector.newConnector()).thenReturn(mockConnector);
    when(org.gradle.tooling.GradleConnector.newCancellationTokenSource())
        .thenReturn(mockCancellationTokenSource);
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
    when(mockGradleProjectBuilder.withCancellationToken(any()))
        .thenReturn(mockGradleProjectBuilder);
    when(mockGradleProjectBuilder.addProgressListener(
            any(org.gradle.tooling.ProgressListener.class)))
        .thenReturn(mockGradleProjectBuilder);
    when(mockGradleProjectBuilder.setStandardOutput(any(OutputStream.class)))
        .thenReturn(mockGradleProjectBuilder);
    when(mockGradleProjectBuilder.setStandardError(any(OutputStream.class)))
        .thenReturn(mockGradleProjectBuilder);
    when(mockGradleProjectBuilder.setColorOutput(any(Boolean.class)))
        .thenReturn(mockGradleProjectBuilder);
    when(mockConnection.model(org.gradle.tooling.model.GradleProject.class))
        .thenReturn(mockGradleProjectBuilder);
    when(mockConnection.model(org.gradle.tooling.model.build.BuildEnvironment.class))
        .thenReturn(mockBuildEnvironmentBuilder);

    // Build launcher (run task) mocks
    when(mockBuildLauncher.withCancellationToken(any())).thenReturn(mockBuildLauncher);
    when(mockBuildLauncher.addProgressListener(any(org.gradle.tooling.ProgressListener.class)))
        .thenReturn(mockBuildLauncher);
    when(mockBuildLauncher.setStandardOutput(any(OutputStream.class)))
        .thenReturn(mockBuildLauncher);
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
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);
    stub.getBuild(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).forProjectDirectory(mockProjectDir);
  }

  @Test
  public void getBuild_shouldUseGradleUserHome() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(
                GradleConfig.newBuilder()
                    .setUserHome(mockGradleUserHome.getAbsolutePath().toString())
                    .setWrapperEnabled(true))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

    stub.getBuild(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).useGradleUserHomeDir(mockGradleUserHome);
  }

  @Test
  public void getBuild_shouldThrowIfWrapperNotEnabledAndNoVersionSpecified() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);
    ArgumentCaptor<Throwable> onError = ArgumentCaptor.forClass(Throwable.class);
    stub.getBuild(req, mockResponseObserver);
    verify(mockResponseObserver).onError(onError.capture());
    assertEquals("INTERNAL: Gradle version is required", onError.getValue().getMessage());
  }

  @Test
  public void getBuild_shouldSetGradleVersionWrapperNotEnabledVersionSpecified() throws Exception {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false).setVersion("6.3"))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

    stub.getBuild(req, mockResponseObserver);
    mockResponseObserver.onCompleted();
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).useGradleVersion("6.3");
  }

  @Test
  public void getBuild_shouldUseJvmArgs() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    String jvmArgs = "-Xmx64m -Xms64m";

    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(
                GradleConfig.newBuilder().setJvmArguments(jvmArgs).setWrapperEnabled(true))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

    stub.getBuild(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockGradleProjectBuilder).setJvmArguments(jvmArgs);
  }

  @Test
  public void getBuild_shouldSetColorOutput() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    GetBuildRequest req1 =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .setShowOutputColors(false)
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

    stub.getBuild(req1, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockGradleProjectBuilder).setColorOutput(false);

    GetBuildRequest req2 =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .setShowOutputColors(true)
            .build();
    stub.getBuild(req2, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockGradleProjectBuilder).setColorOutput(true);
  }

  @Test
  public void runTask_shouldSetProjectDirectory() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    RunTaskRequest req =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setTask("tasks")
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .build();
    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);
    stub.runTask(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).forProjectDirectory(mockProjectDir);
  }

  @Test
  public void runTask_shouldUseGradleUserHome() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    RunTaskRequest req =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(
                GradleConfig.newBuilder()
                    .setUserHome(mockGradleUserHome.getAbsolutePath().toString())
                    .setWrapperEnabled(true))
            .build();
    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);

    stub.runTask(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).useGradleUserHomeDir(mockGradleUserHome);
  }

  @Test
  public void runTask_shouldThrowIfWrapperNotEnabledAndNoVersionSpecified() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    RunTaskRequest req =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false))
            .build();
    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);
    ArgumentCaptor<Throwable> onError = ArgumentCaptor.forClass(Throwable.class);
    stub.runTask(req, mockResponseObserver);
    verify(mockResponseObserver).onError(onError.capture());
    assertEquals("INTERNAL: Gradle version is required", onError.getValue().getMessage());
  }

  @Test
  public void runTask_shouldSetGradleVersionWrapperNotEnabledVersionSpecified() throws Exception {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    RunTaskRequest req =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false).setVersion("6.3"))
            .build();
    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);

    stub.runTask(req, mockResponseObserver);
    mockResponseObserver.onCompleted();
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).useGradleVersion("6.3");
  }

  @Test
  public void runTask_shouldUseJvmArgs() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    String jvmArgs = "-Xmx64m -Xms64m";

    RunTaskRequest req =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(
                GradleConfig.newBuilder().setJvmArguments(jvmArgs).setWrapperEnabled(true))
            .build();
    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);

    stub.runTask(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockBuildLauncher).setJvmArguments(jvmArgs);
  }

  @Test
  public void runTask_shouldThrowIfDebugAndNotPortSpecified() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    RunTaskRequest req =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setJavaDebug(true)
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .build();
    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);

    ArgumentCaptor<Throwable> onError = ArgumentCaptor.forClass(Throwable.class);
    stub.runTask(req, mockResponseObserver);
    verify(mockResponseObserver).onError(onError.capture());
    assertEquals("INTERNAL: Java debug port is not set", onError.getValue().getMessage());
  }

  @Test
  public void runTask_shouldSetJwdpEnvironmentVarIfDebug() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    RunTaskRequest req =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setJavaDebug(true)
            .setJavaDebugPort(1111)
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .build();
    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);

    ArgumentCaptor<HashMap<String, String>> setEnvironmentVariables =
        ArgumentCaptor.forClass(HashMap.class);

    stub.runTask(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockBuildLauncher).setEnvironmentVariables(setEnvironmentVariables.capture());
    assertEquals(
        "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:1111",
        setEnvironmentVariables.getValue().get("JAVA_TOOL_OPTIONS"));
  }

  @Test
  public void runTask_shouldSetStandardInput() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    RunTaskRequest req =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .setInput("An input string")
            .build();
    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);

    ArgumentCaptor<InputStream> inputStream = ArgumentCaptor.forClass(InputStream.class);

    stub.runTask(req, mockResponseObserver);
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
  public void runTask_shouldSetColorOutput() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    StreamObserver<RunTaskReply> mockResponseObserver =
        (StreamObserver<RunTaskReply>) mock(StreamObserver.class);

    RunTaskRequest req1 =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .setShowOutputColors(false)
            .build();

    stub.runTask(req1, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockBuildLauncher).setColorOutput(false);

    RunTaskRequest req2 =
        RunTaskRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .setShowOutputColors(true)
            .build();

    stub.runTask(req2, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockBuildLauncher).setColorOutput(true);
  }
}
