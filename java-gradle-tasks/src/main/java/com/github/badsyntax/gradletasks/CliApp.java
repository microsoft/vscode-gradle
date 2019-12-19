package com.github.badsyntax.gradletasks;

import java.io.IOException;
import java.net.UnknownHostException;
import java.util.logging.ConsoleHandler;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.logging.StreamHandler;
import com.github.badsyntax.gradletasks.logging.BasicWriteFormatter;
import com.github.badsyntax.gradletasks.server.GradleTasksServer;

public class CliApp {
    private Logger logger;

    public CliApp(Logger logger) {
        this.logger = logger;
    }

    public static void main(String[] args) throws CliAppException, IOException {
        StreamHandler logHandler = new ConsoleHandler();
        logHandler.setFormatter(new BasicWriteFormatter());
        logHandler.setLevel(Level.ALL);

        Logger logger = Logger.getLogger(CliApp.class.getName());
        logger.setUseParentHandlers(false);
        logger.addHandler(logHandler);

        int port = 8887;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                throw new CliAppException("Invalid port");
            }
        }

        try {
            CliApp app = new CliApp(logger);
            app.startServer(port);
        } catch (CliAppException ex) {
            logger.info(ex.getMessage());
            System.exit(1);
        }
    }

    private void startServer(int port) throws CliAppException {
        try {
            GradleTasksServer server = new GradleTasksServer(port, logger);
            server.start();
        } catch (UnknownHostException e) {
            throw new CliAppException(e.getMessage());
        }
    }
}
