package com.github.badsyntax.gradletasks;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public abstract class StringBufferOutputStream extends OutputStream {
  private final ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

  @Override
  public final void write(int b) throws IOException {
    outputStream.write(b);
  }

  @Override
  public void close() throws IOException {
    onClose(outputStream.toString());
    outputStream.reset();
    outputStream.close();
  }

  public abstract void onClose(String output);
}
