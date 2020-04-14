package com.github.badsyntax.gradletasks;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public abstract class GradleOutputListener extends OutputStream {
    private final ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

    @Override
    public final void write(int b) throws IOException {
        char c = (char) b;
        if (c == System.lineSeparator().charAt(0)) {
            onOutputChanged(outputStream.toString());
            outputStream.reset();
        } else {
            outputStream.write(b);
        }
    }

    abstract void onOutputChanged(String output);
}
