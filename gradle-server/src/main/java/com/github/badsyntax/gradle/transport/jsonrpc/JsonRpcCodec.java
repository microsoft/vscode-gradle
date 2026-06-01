// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.transport.jsonrpc;

import com.google.protobuf.MessageLite;
import java.util.Base64;
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException;
import org.eclipse.lsp4j.jsonrpc.messages.ResponseError;

/**
 * Helpers shared by {@code GradleServiceImpl} and the handler classes for
 * encoding protobuf payloads on the JSON-RPC wire and producing the
 * {@link ResponseErrorException} that LSP4J converts into a JSON-RPC
 * {@code error} object.
 *
 * <p>
 * Error codes follow the JSON-RPC 2.0 reserved server-error range
 * (-32000..-32099) and match what the TS client maps back to the existing
 * extension-side error categories.
 */
public final class JsonRpcCodec {

	/** Maps to the legacy gRPC {@code NOT_FOUND} status. */
	public static final int ERROR_NOT_FOUND = -32001;

	/** Maps to the legacy gRPC {@code CANCELLED} status. */
	public static final int ERROR_CANCELLED = -32002;

	/** Maps to the legacy gRPC {@code UNKNOWN} status. */
	public static final int ERROR_UNKNOWN = -32000;

	/** Maps to the legacy gRPC {@code INTERNAL} status (LSP4J reserved). */
	public static final int ERROR_INTERNAL = -32603;

	private JsonRpcCodec() {
	}

	/** Encode a protobuf message as base64 for transport on the JSON-RPC wire. */
	public static String encode(MessageLite message) {
		return Base64.getEncoder().encodeToString(message.toByteArray());
	}

	/** Decode a base64 string back into the protobuf wire bytes. */
	public static byte[] decode(String base64) {
		return Base64.getDecoder().decode(base64);
	}

	public static ResponseErrorException error(int code, String message) {
		return new ResponseErrorException(new ResponseError(code, message == null ? "" : message, null));
	}

	public static ResponseErrorException error(int code, Throwable cause) {
		String message = cause == null || cause.getMessage() == null ? "" : cause.getMessage();
		return new ResponseErrorException(new ResponseError(code, message, null));
	}
}
