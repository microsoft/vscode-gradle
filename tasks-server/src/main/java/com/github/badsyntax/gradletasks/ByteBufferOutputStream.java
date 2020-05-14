package com.github.badsyntax.gradletasks;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public abstract class ByteBufferOutputStream extends OutputStream {
  private final ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

  @Override
  public final void write(int b) throws IOException {
    outputStream.write(b);
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
