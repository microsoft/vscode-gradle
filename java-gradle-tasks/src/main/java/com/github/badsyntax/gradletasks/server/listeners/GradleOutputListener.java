package com.github.badsyntax.gradletasks.server.listeners;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import javax.inject.Inject;
// import com.github.badsyntax.gradletasks.messages.server.ServerMessage;
import org.java_websocket.WebSocket;

public class GradleOutputListener extends OutputStream {
    private WebSocket connection;
    private final ByteArrayOutputStream baos = new ByteArrayOutputStream();
    // private ServerMessage.OutputChanged.OutputType outputType;

    // @Inject
    // public GradleOutputListener(WebSocket connection,
    //         ServerMessage.OutputChanged.OutputType outputType) {
    //     this.connection = connection;
    //     // this.outputType = outputType;
    // }

    @Override
    public final void write(int b) throws IOException {
        char c = (char) b;
        if (c == System.lineSeparator().charAt(0)) {
            // connection.send(ServerMessage.Message.newBuilder()
            //         .setOutputChanged(ServerMessage.OutputChanged.newBuilder()
            //                 .setMessage(baos.toString()).setOutputType(outputType))
            //         .build().toByteArray());
            baos.reset();
        } else {
            baos.write(b);
        }
    }
}
