package com.github.badsyntax.gradle;

import java.io.ByteArrayOutputStream;

public abstract class ByteBufferOutputStream extends ByteArrayOutputStream {
	@Override
	public void flush() {
		onFlush(toByteArray());
		reset();
	}

	public abstract void onFlush(byte[] bytes);
}
