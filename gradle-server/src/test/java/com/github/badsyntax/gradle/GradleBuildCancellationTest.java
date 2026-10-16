package com.github.badsyntax.gradle;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.github.badsyntax.gradle.handlers.CancelBuildHandler;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleResponse;
import com.github.badsyntax.gradle.transport.jsonrpc.JsonRpcCodec;
import java.util.concurrent.CompletableFuture;
import org.gradle.tooling.CancellationToken;
import org.junit.After;
import org.junit.Test;

public class GradleBuildCancellationTest {
	private static final String FIRST_KEY = "cancellation-test:first-invocation";
	private static final String SECOND_KEY = "cancellation-test:second-invocation";

	@After
	public void tearDown() {
		GradleBuildCancellation.clearToken(FIRST_KEY);
		GradleBuildCancellation.clearToken(SECOND_KEY);
	}

	private CancelBuildReply cancel(String key) throws Exception {
		CompletableFuture<GradleResponse> response = new CompletableFuture<>();
		new CancelBuildHandler(CancelBuildRequest.newBuilder().setCancellationKey(key).build(), response).run();
		return CancelBuildReply.parseFrom(JsonRpcCodec.decode(response.join().getReply()));
	}

	@Test
	public void cancellationBeforeRegistrationRequiresRetry() throws Exception {
		assertFalse(cancel(FIRST_KEY).getBuildRunning());
		CancellationToken token = GradleBuildCancellation.buildToken(FIRST_KEY);
		assertFalse("An unsuccessful early request does not cancel a subsequently registered token",
				token.isCancellationRequested());

		assertTrue(cancel(FIRST_KEY).getBuildRunning());
		assertTrue(token.isCancellationRequested());
	}

	@Test
	public void registeredCancellationIsAcknowledgedAndIdempotent() throws Exception {
		CancellationToken token = GradleBuildCancellation.buildToken(FIRST_KEY);
		assertTrue(cancel(FIRST_KEY).getBuildRunning());
		assertTrue(cancel(FIRST_KEY).getBuildRunning());
		assertTrue(token.isCancellationRequested());
	}

	@Test
	public void clearedTokenDoesNotRetainCancellation() throws Exception {
		GradleBuildCancellation.buildToken(FIRST_KEY);
		assertTrue(cancel(FIRST_KEY).getBuildRunning());
		GradleBuildCancellation.clearToken(FIRST_KEY);
		assertFalse(cancel(FIRST_KEY).getBuildRunning());

		CancellationToken reused = GradleBuildCancellation.buildToken(FIRST_KEY);
		assertFalse(reused.isCancellationRequested());
	}

	@Test
	public void lateCancellationCannotAffectADifferentInvocation() throws Exception {
		GradleBuildCancellation.buildToken(FIRST_KEY);
		GradleBuildCancellation.clearToken(FIRST_KEY);
		CancellationToken next = GradleBuildCancellation.buildToken(SECOND_KEY);

		assertFalse(cancel(FIRST_KEY).getBuildRunning());
		assertFalse(next.isCancellationRequested());
		assertTrue(cancel(SECOND_KEY).getBuildRunning());
		assertTrue(next.isCancellationRequested());
	}
}
