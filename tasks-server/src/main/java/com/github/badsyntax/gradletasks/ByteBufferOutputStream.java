package com.github.badsyntax.gradletasks;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public abstract class ByteBufferOutputStream extends OutputStream {
  private static final int MAX_SIZE = 1024;
  private final ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

  @Override
  public final void write(int b) throws IOException {
    outputStream.write(b);
    if (outputStream.size() == MAX_SIZE
        || Character.toString((char) b).equals(System.lineSeparator())) {
      flush();
    }
  }

  @Override
  public void close() throws IOException {
    if (outputStream.size() > 0) {
      flush();
    }
    outputStream.close();
  }

  @Override
  public void flush() {
    onFlush(outputStream);
    outputStream.reset();
  }

  public abstract void onFlush(ByteArrayOutputStream outputStream);
}
