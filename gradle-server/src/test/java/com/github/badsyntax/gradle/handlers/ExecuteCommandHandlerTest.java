// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.handlers;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import com.github.badsyntax.gradle.ExecuteCommandReply;
import com.github.badsyntax.gradle.ExecuteCommandRequest;
import com.github.badsyntax.gradle.transport.TaskException;
import com.github.badsyntax.gradle.transport.TaskReplySink;
import java.util.ArrayList;
import java.util.List;
import org.junit.Before;
import org.junit.Test;

public class ExecuteCommandHandlerTest {

	private RecordingSink sink;

	@Before
	public void setUp() {
		sink = new RecordingSink();
	}

	@Test
	public void getNormalizedPackageName_validInput_emitsReplyThenCompletes() {
		ExecuteCommandRequest req = ExecuteCommandRequest.newBuilder().setCommand("getNormalizedPackageName")
				.addArguments("com.Example-Pkg").build();

		new ExecuteCommandHandler(req, sink).run();

		assertEquals(1, sink.replies.size());
		assertEquals("com.example.pkg", sink.replies.get(0).getResult());
		assertTrue("expected onCompleted to be called", sink.completed);
		assertFalse("onError must not be called on success", sink.errored());
	}

	@Test
	public void getNormalizedPackageName_missingArgument_emitsInternalErrorAndDoesNotComplete() {
		ExecuteCommandRequest req = ExecuteCommandRequest.newBuilder().setCommand("getNormalizedPackageName").build();

		new ExecuteCommandHandler(req, sink).run();

		assertTrue(sink.replies.isEmpty());
		assertFalse(sink.completed);
		assertNotNull(sink.error);
		assertEquals(TaskException.Type.INTERNAL, sink.error.getType());
		assertEquals("illegal Arguments", sink.error.getMessage());
	}

	@Test
	public void getNormalizedPackageName_tooManyArguments_emitsInternalError() {
		ExecuteCommandRequest req = ExecuteCommandRequest.newBuilder().setCommand("getNormalizedPackageName")
				.addArguments("a").addArguments("b").build();

		new ExecuteCommandHandler(req, sink).run();

		assertTrue(sink.replies.isEmpty());
		assertFalse(sink.completed);
		assertNotNull(sink.error);
		assertEquals(TaskException.Type.INTERNAL, sink.error.getType());
	}

	@Test
	public void unknownCommand_emitsInternalErrorWithCommandInMessage() {
		ExecuteCommandRequest req = ExecuteCommandRequest.newBuilder().setCommand("doesNotExist").build();

		new ExecuteCommandHandler(req, sink).run();

		assertNotNull(sink.error);
		assertEquals(TaskException.Type.INTERNAL, sink.error.getType());
		assertTrue("error message should mention the unknown command, was: " + sink.error.getMessage(),
				sink.error.getMessage().contains("doesNotExist"));
		assertFalse(sink.completed);
	}

	/**
	 * Protocol invariant for any handler: a terminal failure (onError) must be
	 * mutually exclusive with onCompleted, and onNext must not be called after
	 * onError.
	 */
	@Test
	public void onError_andOnCompleted_areMutuallyExclusive() {
		ExecuteCommandRequest req = ExecuteCommandRequest.newBuilder().setCommand("unknown").build();

		new ExecuteCommandHandler(req, sink).run();

		assertTrue("error path must emit onError", sink.errored());
		assertFalse("error path must not call onCompleted", sink.completed);
		assertTrue("error path must not emit replies", sink.replies.isEmpty());
	}

	/**
	 * Minimal in-memory {@link TaskReplySink} that records all interactions so
	 * tests can assert on the wire-neutral protocol exposed to handlers without
	 * pulling in gRPC or JSON-RPC plumbing.
	 */
	private static final class RecordingSink implements TaskReplySink<ExecuteCommandReply> {
		final List<ExecuteCommandReply> replies = new ArrayList<>();
		boolean completed;
		TaskException error;

		@Override
		public void onNext(ExecuteCommandReply reply) {
			replies.add(reply);
		}

		@Override
		public void onCompleted() {
			completed = true;
		}

		@Override
		public void onError(TaskException e) {
			error = e;
		}

		boolean errored() {
			return error != null;
		}
	}
}
