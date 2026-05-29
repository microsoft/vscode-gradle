package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.transport.jsonrpc.TaskSocketServer;
import com.github.badsyntax.gradle.utils.Utils;
import com.google.common.base.Strings;
import com.microsoft.gradle.GradleLanguageServer;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleServer {
	private static final Logger logger = LoggerFactory.getLogger(GradleServer.class.getName());

	private GradleServer() {
	}

	public static void main(String[] args) throws Exception {
		Map<String, String> params = Utils.parseArgs(args);

		int taskServerPort = Integer.parseInt(Utils.validateRequiredParam(params, "port"));
		startTaskServerThread(taskServerPort);

		String languageServerPipePath = params.get("languageServerPipePath");
		if (!Strings.isNullOrEmpty(languageServerPipePath)) {
			startLanguageServerThread(languageServerPipePath);
		}

		boolean startBuildServer = Boolean.parseBoolean(Utils.validateRequiredParam(params, "startBuildServer"));
		if (startBuildServer) {
			String buildServerPipeName = Utils.validateRequiredParam(params, "pipeName");
			String bundleDirectory = Utils.validateRequiredParam(params, "bundleDir");
			startBuildServerThread(buildServerPipeName, bundleDirectory);
		}
	}

	private static void startTaskServerThread(int port) {
		ExecutorService workerExecutor = Executors.newCachedThreadPool(workerThreadFactory());
		Thread serverThread = new Thread(() -> {
			int exitCode = 0;
			try {
				Future<Void> listening = TaskSocketServer.connectAndStart(port, workerExecutor);
				logger.info("Gradle Server JSON-RPC transport connected on loopback port {}", port);
				listening.get();
				logger.info("Gradle Server JSON-RPC transport closed");
			} catch (Exception e) {
				exitCode = 1;
				logger.error("Gradle Server JSON-RPC transport failed", e);
			} finally {
				workerExecutor.shutdownNow();
			}
			logger.info("Exiting Gradle Server JVM because JSON-RPC task transport ended");
			System.exit(exitCode);
		}, "gradle-jsonrpc-server");
		serverThread.start();

		Runtime.getRuntime().addShutdownHook(new Thread(() -> {
			logger.info("Shutting down Gradle Server JSON-RPC transport since JVM is shutting down");
			workerExecutor.shutdownNow();
		}, "gradle-jsonrpc-shutdown"));
	}

	private static void startBuildServerThread(String pipeName, String directory) {
		BuildServerThread buildServerConnectionThread = new BuildServerThread(pipeName, directory);
		Thread buildServerThread = new Thread(buildServerConnectionThread);
		buildServerThread.start();
	}

	private static void startLanguageServerThread(String languageServerPipePath) {
		Thread languageServerThread = new Thread(() -> {
			GradleLanguageServer.main(new String[]{languageServerPipePath});
		});
		languageServerThread.start();
	}

	/**
	 * Worker thread factory: gives every JSON-RPC worker thread a unique name
	 * (suffixed with a monotonic counter) so thread dumps and logs can distinguish
	 * concurrent handlers. Daemon threads so they don't keep the JVM alive past
	 * {@link #main(String[])}. Package-private for testing.
	 */
	static java.util.concurrent.ThreadFactory workerThreadFactory() {
		AtomicInteger counter = new AtomicInteger();
		return runnable -> {
			Thread t = new Thread(runnable, "gradle-jsonrpc-worker-" + counter.incrementAndGet());
			t.setDaemon(true);
			return t;
		};
	}
}
