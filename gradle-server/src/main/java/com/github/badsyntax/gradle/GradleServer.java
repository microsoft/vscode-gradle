package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.transport.jsonrpc.TaskPipeServer;
import com.github.badsyntax.gradle.utils.Utils;
import com.google.common.base.Strings;
import com.microsoft.gradle.GradleLanguageServer;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleServer {
	private static final Logger logger = LoggerFactory.getLogger(GradleServer.class.getName());
	private static final long INITIAL_TASK_RECONNECT_DELAY_MS = 500L;
	private static final long MAX_TASK_RECONNECT_DELAY_MS = 5_000L;
	private static final long PARENT_PROCESS_CHECK_INTERVAL_MS = 5_000L;

	private GradleServer() {
	}

	public static void main(String[] args) throws Exception {
		Map<String, String> params = Utils.parseArgs(args);

		startParentProcessWatcher(params.get("parentPid"));

		String taskServerPipeName = Utils.validateRequiredParam(params, "pipe");
		startTaskServerThread(taskServerPipeName);

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

	private static void startTaskServerThread(String pipeName) {
		AtomicBoolean shutdownRequested = new AtomicBoolean(false);
		AtomicReference<ExecutorService> activeWorkerExecutor = new AtomicReference<>();
		Thread serverThread = new Thread(() -> {
			long reconnectDelayMs = INITIAL_TASK_RECONNECT_DELAY_MS;
			while (!shutdownRequested.get()) {
				ExecutorService workerExecutor = Executors.newCachedThreadPool(workerThreadFactory());
				activeWorkerExecutor.set(workerExecutor);
				boolean connected = false;
				try {
					Future<Void> listening = TaskPipeServer.connectAndStart(pipeName, workerExecutor);
					connected = true;
					reconnectDelayMs = INITIAL_TASK_RECONNECT_DELAY_MS;
					logger.info("Gradle Server JSON-RPC transport connected on task pipe");
					listening.get();
					logger.info("Gradle Server JSON-RPC transport closed");
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
					break;
				} catch (Exception e) {
					if (shutdownRequested.get()) {
						break;
					}
					if (connected) {
						logger.error("Gradle Server JSON-RPC transport session failed; reconnecting", e);
					} else {
						logger.error("Gradle Server JSON-RPC transport connect failed; retrying", e);
					}
				} finally {
					cancelActiveBuilds();
					workerExecutor.shutdownNow();
					activeWorkerExecutor.compareAndSet(workerExecutor, null);
				}
				if (!shutdownRequested.get()) {
					logger.info("Reconnecting Gradle Server JSON-RPC task transport in {} ms", reconnectDelayMs);
					if (!sleepQuietly(reconnectDelayMs)) {
						break;
					}
					reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_TASK_RECONNECT_DELAY_MS);
				}
			}
			logger.info("Gradle Server JSON-RPC task transport loop stopped");
		}, "gradle-jsonrpc-server");
		serverThread.start();

		Runtime.getRuntime().addShutdownHook(new Thread(() -> {
			logger.info("Shutting down Gradle Server JSON-RPC transport since JVM is shutting down");
			shutdownRequested.set(true);
			cancelActiveBuilds();
			ExecutorService workerExecutor = activeWorkerExecutor.get();
			if (workerExecutor != null) {
				workerExecutor.shutdownNow();
			}
		}, "gradle-jsonrpc-shutdown"));
	}

	// Sleep for the given duration, returning false if the thread was
	// interrupted (e.g. JVM shutdown) so callers can break out of their loop.
	private static boolean sleepQuietly(long delayMs) {
		try {
			Thread.sleep(delayMs);
			return true;
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			return false;
		}
	}

	// Cancel any in-flight Gradle builds when the task transport tears down.
	// A build started over the now-dead task channel can no longer stream
	// results back to the client, so we proactively cancel it instead of
	// leaking a Gradle worker that nobody is listening to.
	private static void cancelActiveBuilds() {
		try {
			GradleBuildCancellation.cancelBuilds();
		} catch (Exception e) {
			logger.warn("Failed to cancel active Gradle builds while task transport is closing", e);
		}
	}

	private static void startParentProcessWatcher(String parentPid) {
		if (Strings.isNullOrEmpty(parentPid)) {
			return;
		}
		long pid;
		try {
			pid = Long.parseLong(parentPid);
		} catch (NumberFormatException e) {
			logger.warn("Ignoring invalid parent process id: {}", parentPid);
			return;
		}
		ProcessHandle parentProcess = ProcessHandle.of(pid).orElse(null);
		if (parentProcess == null) {
			logger.warn("Parent process {} was not found; exiting Gradle Server JVM", pid);
			System.exit(0);
			return;
		}
		Thread watcherThread = new Thread(() -> {
			// Poll the parent's liveness rather than rely on the task channel: this
			// keeps orphan cleanup working even while the task transport is healthy.
			// Note: ProcessHandle tracks the original process, but on PID reuse a
			// recycled id could read as alive; the interval is short and the worst
			// case is a slightly delayed exit, so a simple poll is sufficient here.
			while (parentProcess.isAlive()) {
				if (!sleepQuietly(PARENT_PROCESS_CHECK_INTERVAL_MS)) {
					return;
				}
			}
			logger.info("Parent process {} is no longer alive; exiting Gradle Server JVM", pid);
			System.exit(0);
		}, "gradle-parent-process-watcher");
		watcherThread.setDaemon(true);
		watcherThread.start();
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
