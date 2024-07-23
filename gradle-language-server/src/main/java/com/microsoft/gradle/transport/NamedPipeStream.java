// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.transport;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.AsynchronousFileChannel;
import java.nio.channels.ReadableByteChannel;
import java.nio.channels.SocketChannel;
import java.nio.channels.WritableByteChannel;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * A named pipe stream implementation.
 */
public class NamedPipeStream {
	private String pipeName;
	private StreamProvider provider;

	public NamedPipeStream(String pipeName) {
		this.pipeName = pipeName;
	}

	interface StreamProvider {
		InputStream getInputStream() throws IOException;

		OutputStream getOutputStream() throws IOException;
	}

	/**
	 * getSelectedStream.
	 */
	public StreamProvider getSelectedStream() {
		if (provider == null) {
			provider = createProvider();
		}
		return provider;
	}

	private StreamProvider createProvider() {
		PipeStreamProvider pipeStreamProvider = new PipeStreamProvider();
		pipeStreamProvider.initializeNamedPipe();
		return pipeStreamProvider;
	}

	public InputStream getInputStream() throws IOException {
		return getSelectedStream().getInputStream();
	}

	public OutputStream getOutputStream() throws IOException {
		return getSelectedStream().getOutputStream();
	}

	private static boolean isWindows() {
		return System.getProperty("os.name").toLowerCase().contains("win");
	}

	/**
	 * PipeStreamProvider.
	 */
	protected final class PipeStreamProvider implements StreamProvider {

		private InputStream input;
		private OutputStream output;
		private String pipeName = NamedPipeStream.this.pipeName;

		@Override
		public InputStream getInputStream() throws IOException {
			return input;
		}

		@Override
		public OutputStream getOutputStream() throws IOException {
			return output;
		}

		private void initializeNamedPipe() {
			File pipeFile = new File(this.pipeName);
			try {
				attemptConnection(pipeFile);
			} catch (IOException e) {
				throw new IllegalStateException("Error initializing the named pipe", e);
			}
		}

		private void attemptConnection(File pipeFile) throws IOException {
			if (isWindows()) {
				AsynchronousFileChannel channel = AsynchronousFileChannel.open(pipeFile.toPath(),
						StandardOpenOption.READ, StandardOpenOption.WRITE);
				input = new NamedPipeInputStream(channel);
				output = new NamedPipeOutputStream(channel);
			} else {
				UnixDomainSocketAddress socketAddress = UnixDomainSocketAddress.of(pipeFile.toPath());
				SocketChannel channel = SocketChannel.open(StandardProtocolFamily.UNIX);
				channel.connect(socketAddress);
				input = new NamedPipeInputStream(channel);
				output = new NamedPipeOutputStream(channel);
			}
		}
	}

	/**
	 * NamedPipeInputStream.
	 */
	public class NamedPipeInputStream extends InputStream {

		private ReadableByteChannel unixChannel;
		private AsynchronousFileChannel winChannel;
		private ByteBuffer buffer = ByteBuffer.allocate(1024);
		private int readyBytes = 0;

		public NamedPipeInputStream(ReadableByteChannel channel) {
			this.unixChannel = channel;
		}

		public NamedPipeInputStream(AsynchronousFileChannel channel) {
			this.winChannel = channel;
		}

		@Override
		public int read() throws IOException {
			if (buffer.position() < readyBytes) {
				return buffer.get() & 0xFF;
			}
			try {
				buffer.clear();
				if (winChannel != null) {
					readyBytes = winChannel.read(buffer, 0).get();
				} else {
					readyBytes = unixChannel.read(buffer);
				}
				if (readyBytes == -1) {
					return -1; // EOF
				}
				buffer.flip();
				return buffer.get() & 0xFF;
			} catch (InterruptedException | ExecutionException e) {
				throw new IOException(e);
			}
		}
	}

	/**
	 * NamedPipeOutputStream.
	 */
	public class NamedPipeOutputStream extends OutputStream {
		private WritableByteChannel unixChannel;
		private AsynchronousFileChannel winChannel;
		private ByteBuffer buffer = ByteBuffer.allocate(1);

		public NamedPipeOutputStream(WritableByteChannel channel) {
			this.unixChannel = channel;
		}

		public NamedPipeOutputStream(AsynchronousFileChannel channel) {
			this.winChannel = channel;
		}

		@Override
		public void write(int b) throws IOException {
			buffer.clear();
			buffer.put((byte) b);
			buffer.position(0);
			if (winChannel != null) {
				Future<Integer> result = winChannel.write(buffer, 0);
				try {
					result.get();
				} catch (Exception e) {
					throw new IOException(e);
				}
			} else {
				unixChannel.write(buffer);
			}
		}

		@Override
		public void write(byte[] b) throws IOException {
			final int buffer_size = 1024;
			int blocks = b.length / buffer_size;
			int writeBytes = 0;
			for (int i = 0; i <= blocks; i++) {
				int offset = i * buffer_size;
				int length = Math.min(b.length - writeBytes, buffer_size);
				if (length <= 0) {
					break;
				}
				writeBytes += length;
				ByteBuffer buffer = ByteBuffer.wrap(b, offset, length);
				if (winChannel != null) {
					Future<Integer> result = winChannel.write(buffer, 0);
					try {
						result.get();
					} catch (Exception e) {
						throw new IOException(e);
					}
				} else {
					unixChannel.write(buffer);
				}
			}
		}
	}
}
