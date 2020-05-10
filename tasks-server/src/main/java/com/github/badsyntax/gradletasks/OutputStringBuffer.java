package com.github.badsyntax.gradletasks;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public class OutputStringBuffer extends OutputStream {
  private final ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

  @Override
  public final void write(int b) throws IOException {
    outputStream.write(b);
  }

  @Override
  public void write(byte[] b, int off, int len) throws IOException {
    outputStream.write(b, off, len);
  }

  public String getOutput() {
    return outputStream.toString();
  }

  @Override
  public void close() throws IOException {
    outputStream.reset();
    outputStream.close();
  }
}
