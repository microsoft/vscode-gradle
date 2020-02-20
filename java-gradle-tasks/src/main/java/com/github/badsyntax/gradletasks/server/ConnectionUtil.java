package com.github.badsyntax.gradletasks.server;

// import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import org.java_websocket.WebSocket;

public class ConnectionUtil {

  private ConnectionUtil() {

  }

  public static void sendInfoMessage(WebSocket connection, String message) {
    if (connection.isOpen()) {
      // connection.send(ServerMessage.Message.newBuilder()
      //     .setInfo(ServerMessage.Info.newBuilder().setMessage(message)).build().toByteArray());
    }
  }

  public static void sendErrorMessage(WebSocket connection, String message) {
    if (connection.isOpen()) {
      // connection.send(ServerMessage.Message.newBuilder()
      //     .setError(ServerMessage.Error.newBuilder().setMessage(message)).build().toByteArray());
    }
  }
}
