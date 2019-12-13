package com.github.badsyntax.gradletasks;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.logging.Logger;

class LoggerOutputStream extends OutputStream {
    private Logger logger;
    private final ByteArrayOutputStream baos = new ByteArrayOutputStream();

    public LoggerOutputStream(Logger logger) {
        this.logger = logger;
    }

    @Override
    public final void write(int b) throws IOException {
        char c = (char) b;
        if (c == '\n') {
            logger.info(String.format("%s%s", baos.toString(), "\n"));
            baos.reset();
        } else {
            baos.write(b);
        }
    }
}
