/*******************************************************************************
 * Copyright (c) 2021 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *    Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.CancelDependenciesReply;
import com.github.badsyntax.gradle.CancelDependenciesRequest;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelDependenciesHandler {
  private static final Logger logger =
      LoggerFactory.getLogger(CancelDependenciesHandler.class.getName());

  private CancelDependenciesRequest req;
  private StreamObserver<CancelDependenciesReply> responseObserver;

  public CancelDependenciesHandler(
      CancelDependenciesRequest req, StreamObserver<CancelDependenciesReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    try {
      GradleBuildCancellation.cancelBuild(req.getCancellationKey());
      replyWithCancelledSuccess();
    } catch (GradleCancellationException e) {
      logger.error(e.getMessage());
      replyWithCancelError(e);
    } finally {
      responseObserver.onCompleted();
    }
  }

  private void replyWithCancelledSuccess() {
    responseObserver.onNext(
        CancelDependenciesReply.newBuilder()
            .setMessage("Cancel getting dependencies requested")
            .build());
  }

  private void replyWithCancelError(Exception e) {
    responseObserver.onNext(
        CancelDependenciesReply.newBuilder().setMessage(e.getMessage()).build());
  }
}
