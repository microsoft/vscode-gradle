package com.github.badsyntax.gradle;

import io.grpc.Status;
import io.grpc.StatusRuntimeException;

public class ErrorMessageBuilder {
	private ErrorMessageBuilder() {
	}

	public static StatusRuntimeException build(Exception e) {
		return build(e, Status.INTERNAL);
	}

	public static StatusRuntimeException build(Exception e, Status status) {
		return status.withDescription(e.getMessage()).asRuntimeException();
	}
}
