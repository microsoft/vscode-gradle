package com.github.badsyntax.gradletasks;

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import java.util.ArrayList;
import java.util.List;
import com.google.rpc.Code;
import com.google.rpc.Status;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;
import org.mockito.ArgumentCaptor;
import io.grpc.ManagedChannel;
import io.grpc.StatusRuntimeException;
import io.grpc.inprocess.InProcessChannelBuilder;
import io.grpc.inprocess.InProcessServerBuilder;
import io.grpc.protobuf.StatusProto;
import io.grpc.stub.StreamObserver;
import io.grpc.testing.GrpcCleanupRule;

@RunWith(JUnit4.class)
public class GradleTasksServerTest {
  @Rule
  public final GrpcCleanupRule grpcCleanup = new GrpcCleanupRule();

  private GradleTasksServer server;

  private ManagedChannel inProcessChannel;

  @Before
  public void setUp() throws Exception {
    String serverName = InProcessServerBuilder.generateName();
    server = new GradleTasksServer(InProcessServerBuilder.forName(serverName).directExecutor(), 0);
    server.start();
    inProcessChannel =
        grpcCleanup.register(InProcessChannelBuilder.forName(serverName).directExecutor().build());
  }

  @After
  public void tearDown() throws Exception {
    server.stop();
  }

  @SuppressWarnings(value = "unchecked")
  @Test
  public void getProject_shouldErrorIfSourceDirectoryDoesNotExist() {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    GetProjectRequest req = GetProjectRequest.newBuilder().setSourceDir("does/not/exist").build();
    StreamObserver<GetProjectReply> responseObserver =
        (StreamObserver<GetProjectReply>) mock(StreamObserver.class);
    ArgumentCaptor<Throwable> onError = ArgumentCaptor.forClass(Throwable.class);
    stub.getProject(req, responseObserver);
    verify(responseObserver).onError(onError.capture());
    assertEquals("INTERNAL: Source directory does not exist: does/not/exist",
        onError.getValue().getMessage());
  }
}
