package com.github.badsyntax.gradletasks;

import java.io.IOException;
import javax.inject.Inject;
import com.github.badsyntax.gradletasks.server.Server;

public class Application {

    @Inject
    Server server;

    @Inject
    public Application(int port) {
        ApplicationFactory applicationFactory =
                DaggerApplicationFactory.builder().withPort(port).build();
        applicationFactory.inject(this);
    }

    public static void main(String[] args) throws ApplicationException, IOException {
        int port = 8887;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                throw new ApplicationException("Invalid port");
            }
        }
        Application application = new Application(port);
        application.run();
    }

    public void run() throws ApplicationException {
        server.start();
    }
}
