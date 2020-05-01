package com.github.badsyntax.gradletasks;

import com.google.rpc.Code;
import com.google.rpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.protobuf.StatusProto;

public class ErrorMessageBuilder {
  private ErrorMessageBuilder() {}

  public static StatusRuntimeException build(Exception e) {
    return StatusProto.toStatusRuntimeException(
        Status.newBuilder().setCode(Code.INTERNAL.getNumber()).setMessage(e.getMessage()).build());
  }
}
