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
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;

import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.core.runtime.Platform;
import com.microsoft.gradle.bs.importer.model.Telemetry;

/**
 * A class to create a named pipe stream for the importer to communicate with the extension.
 */
public class NamedPipeStream {

    private StreamProvider provider;

    private final int MAX_ATTEMPTS = 5;

    interface StreamProvider {
        InputStream getInputStream() throws IOException;
        OutputStream getOutputStream() throws IOException;
    }

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
    protected final class PipeStreamProvider implements StreamProvider {

        private InputStream input;
        private OutputStream output;

        @Override
        public InputStream getInputStream() throws IOException {
            return input;
        }

        @Override
        public OutputStream getOutputStream() throws IOException {
            return output;
        }

        private void initializeNamedPipe() {
            String pathName = generateRandomPipeName();
            sendImporterPipeName(pathName);
            File pipeFile = new File(pathName);

            int attempts = 0;
            // Need to retry until the pipeName was sent and pipe is created by Extension side
            while (attempts < MAX_ATTEMPTS) {
                try {
                    attemptConnection(pipeFile);
                    break;
                } catch (IOException e) {
                    sleep(e, attempts);
                    attempts++;
                }
            }
            Telemetry telemetry = new Telemetry("importerConnectAttempts", attempts);
            Utils.sendTelemetry(JavaLanguageServerPlugin.getProjectsManager().getConnection(),
                        telemetry);
            if (attempts == MAX_ATTEMPTS) {
                throw new RuntimeException("Failed to connect to the named pipe after " + MAX_ATTEMPTS + " attempts");
            }
        }

        private static String generateRandomHex(int numBytes) {
            SecureRandom random = new SecureRandom();
            byte[] bytes = new byte[numBytes];
            random.nextBytes(bytes);
            StringBuilder hexString = new StringBuilder();
            for (byte b : bytes) {
                hexString.append(String.format("%02x", b));
            }
            return hexString.toString();
        }

        private String generateRandomPipeName() {
            if (System.getProperty("os.name").startsWith("Windows")) {
                return Paths.get("\\\\.\\pipe\\", generateRandomHex(16) + "-sock").toString();
            }
            String tmpDir = System.getenv("XDG_RUNTIME_DIR");
            if (tmpDir == null || tmpDir.isEmpty()) {
                tmpDir = System.getProperty("java.io.tmpdir");
            }
            int fixedLength = ".sock".length();
            int safeIpcPathLengths = 103;
            int availableLength = safeIpcPathLengths - fixedLength - tmpDir.length();
            int randomLength = 32;
            int bytesLength = Math.min(availableLength / 2, randomLength);

            if (bytesLength < 16) {
                throw new IllegalArgumentException("Unable to generate a random pipe name with character length less than 16");
            }
            return Paths.get(tmpDir, generateRandomHex(bytesLength) + ".sock").toString();
        }

        private void sendImporterPipeName(String pipeName) {
            JavaLanguageServerPlugin.getInstance().getClientConnection()
                .sendNotification("gradle.onWillImporterConnect", pipeName);
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

        private void sleep(IOException e, int attempts) {
            try {
                Thread.sleep(1000);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("Thread interrupted while handling connection failure", ie);
            }
        }

        protected static boolean isWindows() {
            return Platform.OS_WIN32.equals(Platform.getOS());
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
}
