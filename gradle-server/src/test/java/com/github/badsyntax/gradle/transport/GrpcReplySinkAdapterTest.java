// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.github.badsyntax.gradle.ExecuteCommandReply;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

@SuppressWarnings("unchecked")
public class GrpcReplySinkAdapterTest {

	private StreamObserver<ExecuteCommandReply> delegate;
	private GrpcReplySinkAdapter<ExecuteCommandReply> adapter;

	@Before
	public void setUp() {
		delegate = (StreamObserver<ExecuteCommandReply>) mock(StreamObserver.class);
		adapter = new GrpcReplySinkAdapter<>(delegate);
	}

	@Test
	public void onNext_isForwardedToDelegate() {
		ExecuteCommandReply reply = ExecuteCommandReply.newBuilder().setResult("ok").build();

		adapter.onNext(reply);

		verify(delegate).onNext(reply);
		verifyNoMoreInteractions(delegate);
	}

	@Test
	public void onCompleted_isForwardedToDelegate() {
		adapter.onCompleted();

		verify(delegate).onCompleted();
		verifyNoMoreInteractions(delegate);
	}

	@Test
	public void onError_notFound_mapsToNotFoundStatus() {
		adapter.onError(new TaskException(TaskException.Type.NOT_FOUND, "no build"));

		assertEquals(Status.Code.NOT_FOUND, captureErrorStatus().getCode());
	}

	@Test
	public void onError_cancelled_mapsToCancelledStatus() {
		adapter.onError(new TaskException(TaskException.Type.CANCELLED, "cancelled"));

		assertEquals(Status.Code.CANCELLED, captureErrorStatus().getCode());
	}

	@Test
	public void onError_unknown_mapsToUnknownStatus() {
		adapter.onError(new TaskException(TaskException.Type.UNKNOWN, "unknown"));

		assertEquals(Status.Code.UNKNOWN, captureErrorStatus().getCode());
	}

	@Test
	public void onError_internal_mapsToInternalStatus() {
		adapter.onError(new TaskException(TaskException.Type.INTERNAL, "boom"));

		assertEquals(Status.Code.INTERNAL, captureErrorStatus().getCode());
	}

	/**
	 * Guards the {@code .withCause(error.getCause())} fix from PR #1861 review: the
	 * underlying cause must propagate to the StatusRuntimeException so server logs
	 * can show the real stacktrace, and the description must be set to the domain
	 * message (not the cause's toString).
	 */
	@Test
	public void onError_preservesCauseAndDescription() {
		Throwable rootCause = new RuntimeException("real root");
		adapter.onError(new TaskException(TaskException.Type.INTERNAL, "domain message", rootCause));

		StatusRuntimeException emitted = captureErrorThrowable();
		assertSame(rootCause, emitted.getStatus().getCause());
		assertEquals("domain message", emitted.getStatus().getDescription());
	}

	@Test
	public void onError_withoutCause_isTolerated() {
		adapter.onError(new TaskException(TaskException.Type.INTERNAL, "no cause here"));

		StatusRuntimeException emitted = captureErrorThrowable();
		assertEquals("no cause here", emitted.getStatus().getDescription());
	}

	@Test
	public void onError_emitsStatusRuntimeException() {
		adapter.onError(new TaskException(TaskException.Type.INTERNAL, "boom"));

		ArgumentCaptor<Throwable> captor = ArgumentCaptor.forClass(Throwable.class);
		verify(delegate).onError(captor.capture());
		assertTrue("expected StatusRuntimeException, was " + captor.getValue().getClass(),
				captor.getValue() instanceof StatusRuntimeException);
	}

	private Status captureErrorStatus() {
		return captureErrorThrowable().getStatus();
	}

	private StatusRuntimeException captureErrorThrowable() {
		ArgumentCaptor<Throwable> captor = ArgumentCaptor.forClass(Throwable.class);
		verify(delegate).onError(captor.capture());
		return (StatusRuntimeException) captor.getValue();
	}
}
