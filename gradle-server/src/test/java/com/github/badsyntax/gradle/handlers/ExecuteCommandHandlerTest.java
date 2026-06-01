// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.handlers;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.github.badsyntax.gradle.ExecuteCommandRequest;
import com.github.badsyntax.gradle.transport.jsonrpc.GradleResponse;
import com.github.badsyntax.gradle.transport.jsonrpc.JsonRpcCodec;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException;
import org.eclipse.lsp4j.jsonrpc.messages.ResponseError;
import org.junit.Test;

/**
 * Covers the JSON-RPC error code mapping for {@link ExecuteCommandHandler}.
 *
 * <p>
 * Client-caused input errors (unknown command, wrong argument count) must be
 * reported with non-INTERNAL codes so the TS client can distinguish "I sent a
 * bad request" from "the JVM blew up". {@code ERROR_INTERNAL} stays reserved
 * for unexpected server-side failures from {@code Utils.normalizePackageName}.
 */
public class ExecuteCommandHandlerTest {

	@Test
	public void unknownCommand_isReportedAsNotFound() {
		CompletableFuture<GradleResponse> response = new CompletableFuture<>();
		ExecuteCommandRequest request = ExecuteCommandRequest.newBuilder().setCommand("doesNotExist").build();

		new ExecuteCommandHandler(request, response).run();

		ResponseError error = expectError(response);
		assertEquals(JsonRpcCodec.ERROR_NOT_FOUND, error.getCode());
		assertTrue("error message should name the unknown command: " + error.getMessage(),
				error.getMessage().contains("doesNotExist"));
	}

	@Test
	public void getNormalizedPackageName_withZeroArguments_isReportedAsUnknown() {
		CompletableFuture<GradleResponse> response = new CompletableFuture<>();
		ExecuteCommandRequest request = ExecuteCommandRequest.newBuilder().setCommand("getNormalizedPackageName")
				.build();

		new ExecuteCommandHandler(request, response).run();

		ResponseError error = expectError(response);
		assertEquals(JsonRpcCodec.ERROR_UNKNOWN, error.getCode());
		assertTrue("error message should mention argument count: " + error.getMessage(),
				error.getMessage().contains("Illegal arguments"));
	}

	@Test
	public void getNormalizedPackageName_withTwoArguments_isReportedAsUnknown() {
		CompletableFuture<GradleResponse> response = new CompletableFuture<>();
		ExecuteCommandRequest request = ExecuteCommandRequest.newBuilder().setCommand("getNormalizedPackageName")
				.addArguments("a").addArguments("b").build();

		new ExecuteCommandHandler(request, response).run();

		ResponseError error = expectError(response);
		assertEquals(JsonRpcCodec.ERROR_UNKNOWN, error.getCode());
	}

	@Test
	public void getNormalizedPackageName_withOneArgument_succeeds() {
		CompletableFuture<GradleResponse> response = new CompletableFuture<>();
		ExecuteCommandRequest request = ExecuteCommandRequest.newBuilder().setCommand("getNormalizedPackageName")
				.addArguments("com.example.HelloWorld").build();

		new ExecuteCommandHandler(request, response).run();

		GradleResponse reply = response.getNow(null);
		assertNotNull("response should complete synchronously on the happy path", reply);
		assertNotNull(reply.getReply());
	}

	private static ResponseError expectError(CompletableFuture<GradleResponse> response) {
		try {
			response.get();
			fail("Expected ResponseErrorException");
		} catch (ExecutionException ee) {
			Throwable cause = ee.getCause();
			assertNotNull("ExecutionException had no cause", cause);
			assertTrue("Expected ResponseErrorException, got " + cause.getClass().getName(),
					cause instanceof ResponseErrorException);
			return ((ResponseErrorException) cause).getResponseError();
		} catch (InterruptedException ie) {
			Thread.currentThread().interrupt();
			throw new AssertionError("interrupted while awaiting response", ie);
		}
		throw new AssertionError("unreachable");
	}
}
