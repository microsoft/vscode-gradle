package com.github.badsyntax.gradletasks.server.handlers;

import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
import com.github.badsyntax.gradletasks.server.GetTasksReply;
import com.google.protobuf.GeneratedMessageV3;
import org.java_websocket.WebSocket;
import io.grpc.stub.StreamObserver;

public interface MessageHandler {
  public void handle(GeneratedMessageV3 req, StreamObserver<GeneratedMessageV3> responseObserver);
}
