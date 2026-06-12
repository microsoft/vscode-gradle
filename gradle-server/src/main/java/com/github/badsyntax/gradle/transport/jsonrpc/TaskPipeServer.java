// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

import java.io.Closeable;
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
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import org.eclipse.lsp4j.jsonrpc.Launcher;

/**
 * Bootstraps the JSON-RPC task transport over a named pipe (Windows) or Unix
 * domain socket (macOS/Linux).
 */
public final class TaskPipeServer {

	private TaskPipeServer() {
	}

	/**
	 * Open the pipe, build the JSON-RPC launcher, and start listening.
	 *
	 * @param pipeName
	 *            named pipe / Unix socket path the extension is listening on
	 * @param workerExecutor
	 *            executor used by {@link GradleServiceImpl} to run handlers; the
	 *            caller is responsible for shutting it down once the returned
	 *            {@link Future} completes.
	 * @return a {@link Future} that resolves when the JSON-RPC channel closes;
	 *         block on it from a dedicated thread to keep the JVM alive
	 */
	public static Future<Void> connectAndStart(String pipeName, ExecutorService workerExecutor) throws IOException {
		PipeStreams pipeStreams = PipeStreams.open(pipeName);

		try {
			GradleServiceImpl service = new GradleServiceImpl(workerExecutor);
			Launcher<GradleClient> launcher = new Launcher.Builder<GradleClient>().setLocalService(service)
					.setRemoteInterface(GradleClient.class).setInput(pipeStreams.getInputStream())
					.setOutput(pipeStreams.getOutputStream()).setExecutorService(workerExecutor).create();
			service.setClient(launcher.getRemoteProxy());

			Future<Void> listening = launcher.startListening();
			closeWhenDone(listening, pipeStreams);
			return listening;
		} catch (RuntimeException e) {
			closeOnFailure(pipeStreams, e);
			throw e;
		}
	}

	private static void closeWhenDone(Future<Void> listening, Closeable closeable) {
		Thread closer = new Thread(() -> {
			try {
				listening.get();
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			} catch (ExecutionException e) {
				// fall through to close the pipe regardless of how listening ended
			} finally {
				try {
					closeable.close();
				} catch (IOException ignored) {
					// best-effort cleanup; nothing to do if the pipe is already torn down
				}
			}
		}, "gradle-jsonrpc-pipe-closer");
		closer.setDaemon(true);
		closer.start();
	}

	private static boolean isWindows() {
		return System.getProperty("os.name").toLowerCase().contains("win");
	}

	private static final class PipeStreams implements Closeable {
		private final InputStream inputStream;
		private final OutputStream outputStream;
		private final Closeable channel;

		private PipeStreams(InputStream inputStream, OutputStream outputStream, Closeable channel) {
			this.inputStream = inputStream;
			this.outputStream = outputStream;
			this.channel = channel;
		}

		private static PipeStreams open(String pipeName) throws IOException {
			if (pipeName == null || pipeName.isBlank()) {
				throw new IOException("Gradle task pipe name is empty");
			}
			Path pipePath = Path.of(pipeName);
			if (isWindows()) {
				AsynchronousFileChannel channel = AsynchronousFileChannel.open(pipePath, StandardOpenOption.READ,
						StandardOpenOption.WRITE);
				return new PipeStreams(new PipeInputStream(channel), new PipeOutputStream(channel), channel);
			}

			UnixDomainSocketAddress socketAddress = UnixDomainSocketAddress.of(pipePath);
			SocketChannel channel = SocketChannel.open(StandardProtocolFamily.UNIX);
			try {
				channel.connect(socketAddress);
				return new PipeStreams(new PipeInputStream(channel), new PipeOutputStream(channel), channel);
			} catch (IOException | RuntimeException e) {
				closeOnFailure(channel, e);
				throw e;
			}
		}

		private InputStream getInputStream() {
			return inputStream;
		}

		private OutputStream getOutputStream() {
			return outputStream;
		}

		@Override
		public void close() throws IOException {
			channel.close();
		}
	}

	private static void closeOnFailure(Closeable closeable, Exception failure) {
		try {
			closeable.close();
		} catch (IOException closeException) {
			failure.addSuppressed(closeException);
		}
	}

	private static final class PipeInputStream extends InputStream {
		private final ReadableByteChannel unixChannel;
		private final AsynchronousFileChannel winChannel;
		private final ByteBuffer buffer = ByteBuffer.allocate(8192);

		private PipeInputStream(ReadableByteChannel channel) {
			unixChannel = channel;
			winChannel = null;
			buffer.limit(0);
		}

		private PipeInputStream(AsynchronousFileChannel channel) {
			unixChannel = null;
			winChannel = channel;
			buffer.limit(0);
		}

		@Override
		public int read() throws IOException {
			if (!buffer.hasRemaining() && fillBuffer() == -1) {
				return -1;
			}
			return buffer.get() & 0xFF;
		}

		@Override
		public int read(byte[] bytes, int offset, int length) throws IOException {
			Objects.checkFromIndexSize(offset, length, bytes.length);
			if (length == 0) {
				return 0;
			}
			if (!buffer.hasRemaining() && fillBuffer() == -1) {
				return -1;
			}
			int bytesToRead = Math.min(length, buffer.remaining());
			buffer.get(bytes, offset, bytesToRead);
			return bytesToRead;
		}

		private int fillBuffer() throws IOException {
			try {
				int readyBytes;
				do {
					buffer.clear();
					readyBytes = winChannel != null ? winChannel.read(buffer, 0).get() : unixChannel.read(buffer);
				} while (readyBytes == 0);
				if (readyBytes == -1) {
					buffer.limit(0);
					return -1;
				}
				buffer.flip();
				return readyBytes;
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				throw new IOException(e);
			} catch (ExecutionException e) {
				throw new IOException(e);
			}
		}
	}

	private static final class PipeOutputStream extends OutputStream {
		private final WritableByteChannel unixChannel;
		private final AsynchronousFileChannel winChannel;

		private PipeOutputStream(WritableByteChannel channel) {
			unixChannel = channel;
			winChannel = null;
		}

		private PipeOutputStream(AsynchronousFileChannel channel) {
			unixChannel = null;
			winChannel = channel;
		}

		@Override
		public void write(int b) throws IOException {
			write(new byte[]{(byte) b}, 0, 1);
		}

		@Override
		public void write(byte[] bytes, int offset, int length) throws IOException {
			Objects.checkFromIndexSize(offset, length, bytes.length);
			if (length == 0) {
				return;
			}
			ByteBuffer buffer = ByteBuffer.wrap(bytes, offset, length);
			try {
				while (buffer.hasRemaining()) {
					if (winChannel != null) {
						winChannel.write(buffer, 0).get();
					} else {
						unixChannel.write(buffer);
					}
				}
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				throw new IOException(e);
			} catch (ExecutionException e) {
				throw new IOException(e);
			}
		}
	}
}
