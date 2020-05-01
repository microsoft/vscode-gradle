// package com.github.badsyntax.gradletasks;

// import static org.junit.Assert.assertEquals;
// import static org.mockito.Mockito.mock;
// import static org.mockito.Mockito.verify;
// import java.io.File;
// import java.io.IOException;
// import java.nio.file.Files;
// import java.nio.file.Path;
// import org.junit.After;
// import org.junit.Before;
// import org.junit.Rule;
// import org.junit.Test;
// import org.junit.runner.RunWith;
// import org.junit.runners.JUnit4;
// import org.mockito.ArgumentCaptor;
// import io.grpc.ManagedChannel;
// import io.grpc.inprocess.InProcessChannelBuilder;
// import io.grpc.inprocess.InProcessServerBuilder;
// import io.grpc.stub.StreamObserver;
// import io.grpc.testing.GrpcCleanupRule;

// @RunWith(JUnit4.class)
// public class GradleTasksServerTest {
//   @Rule
//   public final GrpcCleanupRule grpcCleanup = new GrpcCleanupRule();

//   private GradleTasksServer server;
//   private ManagedChannel inProcessChannel;
//   private File projectDir;

//   @Before
//   public void setUp() throws Exception {
//     String serverName = InProcessServerBuilder.generateName();
//     server = new GradleTasksServer(InProcessServerBuilder.forName(serverName).directExecutor(),
// 0);
//     server.start();
//     inProcessChannel =

//
// grpcCleanup.register(InProcessChannelBuilder.forName(serverName).directExecutor().build());
//     projectDir = new File(Files.createTempDirectory("projectDir").toAbsolutePath().toString());
//   }

//   @After
//   public void tearDown() throws Exception {
//     server.stop();
//     projectDir.delete();
//   }

//   // @SuppressWarnings(value = "unchecked")
//   // @Test
//   // public void getBuild_shouldErrorIfSourceDirectoryDoesNotExist() {
//   // GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
//   // GetBuildRequest req = GetBuildRequest.newBuilder().setProjectDir("does/not/exist").build();
//   // StreamObserver<GetBuildReply> responseObserver =
//   // (StreamObserver<GetBuildReply>) mock(StreamObserver.class);
//   // ArgumentCaptor<Throwable> onError = ArgumentCaptor.forClass(Throwable.class);
//   // stub.getBuild(req, responseObserver);
//   // verify(responseObserver).onError(onError.capture());
//   // assertEquals("INTERNAL: Project directory does not exist: does/not/exist",
//   // onError.getValue().getMessage());
//   // }

//   @SuppressWarnings(value = "unchecked")
//   @Test
//   public void getBuild_shouldUseGradleUserHomeConfig() throws IOException {
//     GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
//     Path gradleUserHome = Files.createTempDirectory("gradleUserHome");
//     GetBuildRequest req =
//         GetBuildRequest.newBuilder().setProjectDir(projectDir.getAbsolutePath().toString())
//             .setGradleConfig(
//
// GradleConfig.newBuilder().setUserHome(gradleUserHome.toAbsolutePath().toString()))
//             .build();
//     StreamObserver<GetBuildReply> responseObserver =
//         (StreamObserver<GetBuildReply>) mock(StreamObserver.class);
//     stub.getBuild(req, responseObserver);
//   }

//   // @SuppressWarnings(value = "unchecked")
//   // @Test
//   // public void getBuild_shouldUseGradleUserHomeConfig() throws IOException {
//   // GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
//   // Path gradleUserHome = Files.createTempDirectory("gradleUserHome");
//   // GetBuildRequest req =
//   // GetBuildRequest.newBuilder().setProjectDir(projectDir.getAbsolutePath().toString())
//   //
//   //
// .setGradleConfig(GradleConfig.newBuilder().setUserHome(gradleUserHome.toAbsolutePath().toString()))
//   // .build();
//   // // TODO mock gradle connector and gradleProject
//   // // StreamObserver<GetBuildReply> responseObserver =
//   // // (StreamObserver<GetBuildReply>) mock(StreamObserver.class);
//   // // ArgumentCaptor<Throwable> onError = ArgumentCaptor.forClass(Throwable.class);
//   // // stub.getBuild(req, responseObserver);
//   // // verify(responseObserver).onError(onError.capture());
//   // // assertEquals("INTERNAL: Project directory does not exist: does/not/exist",
//   // // onError.getValue().getMessage());
//   // }
// }
