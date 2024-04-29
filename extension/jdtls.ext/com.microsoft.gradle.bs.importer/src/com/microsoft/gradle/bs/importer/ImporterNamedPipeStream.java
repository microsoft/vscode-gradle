/*******************************************************************************
 * Copyright (c) 2016-2017 Red Hat Inc. and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *     Red Hat Inc. - initial API and implementation
 *******************************************************************************/
package com.microsoft.gradle.bs.importer;

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
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;

import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.core.runtime.Platform;

/**
 * A factory for creating the streams for supported transmission methods.
 *
 * @author Gorkem Ercan
 *
 */

public class ImporterNamedPipeStream {
	private String bundleDir;

	private StreamProvider provider;

	interface StreamProvider {
		InputStream getInputStream() throws IOException;

		OutputStream getOutputStream() throws IOException;
	}

	protected final class PipeStreamProvider implements StreamProvider {

		private InputStream input;
		private OutputStream output;

		public PipeStreamProvider() {
			initializeNamedPipe();
		}

		@Override
		public InputStream getInputStream() throws IOException {
			return input;
		}

		@Override
		public OutputStream getOutputStream() throws IOException {
			return output;
		}

		private void initializeNamedPipe() {
			String pathName = generateRandomPipeName("importer");
			sendImporterPipeName(pathName);
			File pipeFile = new File(pathName);
			if (isWindows()) {
			    pipeFile = new File(pathName);
				AsynchronousFileChannel channel = null;
				try {
					channel = AsynchronousFileChannel.open(pipeFile.toPath(), StandardOpenOption.READ, StandardOpenOption.WRITE);
					input = new NamedPipeInputStream(channel);
					output = new NamedPipeOutputStream(channel);
				} catch (IOException e) {
					e.printStackTrace();
				}
				return;
			}

			// Need to retry until the pipeName was sent and pipe is created by Extension side
			boolean connected = false;
			while (!connected) {
				try {
					UnixDomainSocketAddress socketAddress = UnixDomainSocketAddress.of(pipeFile.toPath());
					SocketChannel channel = SocketChannel.open(StandardProtocolFamily.UNIX);
					channel.connect(socketAddress);
					input = new NamedPipeInputStream(channel);
					output = new NamedPipeOutputStream(channel);
					connected = true;
				} catch (IOException e) {
					try {
						Thread.sleep(1000);
					} catch (InterruptedException ie) {
						Thread.currentThread().interrupt();
						throw new RuntimeException("Thread interrupted while trying to connect to named pipe", ie);
					}
				}
			}
		}
	}

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
			final int BUFFER_SIZE = 1024;
			int blocks = b.length / BUFFER_SIZE;
			int writeBytes = 0;
			for (int i = 0; i <= blocks; i++) {
				int offset = i * BUFFER_SIZE;
				int length = Math.min(b.length - writeBytes, BUFFER_SIZE);
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

	public ImporterNamedPipeStream(String bundleDir) {
		this.bundleDir = bundleDir;
	}

	public StreamProvider getSelectedStream() {
		if (provider == null) {
			provider = createProvider()	;
		}
		return provider;
	}

	private StreamProvider createProvider() {

		return new PipeStreamProvider();
	}

	public InputStream getInputStream() throws IOException {
		return getSelectedStream().getInputStream();
	}

	public OutputStream getOutputStream() throws IOException {
		return getSelectedStream().getOutputStream();
	}

	protected static boolean isWindows() {
		return Platform.OS_WIN32.equals(Platform.getOS());
	}

	private void sendImporterPipeName(String pipeName){
		JavaLanguageServerPlugin.getInstance().getClientConnection()
			.sendNotification("gradle.getImporterPipeName", pipeName);
	}

	public String generateRandomPipeName(String type) {
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[11];
        random.nextBytes(bytes);
        StringBuilder hexString = new StringBuilder();
        for (byte b : bytes) {
            hexString.append(String.format("%02x", b));
        }
        String randomSuffix = hexString.toString();
        String path;
        if (System.getProperty("os.name").startsWith("Windows")) {
            path = "\\\\.\\pipe\\" + randomSuffix + "-" + type + "-sock";
        } else {
			//save pipe file to extension folder
            path = new File(this.bundleDir).getParent() +'/'+ randomSuffix + "-" + type + ".sock";
        }

        try {
            return new File(path).getCanonicalPath();
        } catch (IOException e) {
            System.err.println("Error generating the canonical pipe path: " + e.getMessage());
            return null;
        }
    }
}
