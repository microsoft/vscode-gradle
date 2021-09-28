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

import com.github.badsyntax.gradle.CancelProjectsReply;
import com.github.badsyntax.gradle.CancelProjectsRequest;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CancelProjectsHandler {
  private static final Logger logger =
      LoggerFactory.getLogger(CancelProjectsHandler.class.getName());

  private CancelProjectsRequest req;
  private StreamObserver<CancelProjectsReply> responseObserver;

  public CancelProjectsHandler(
      CancelProjectsRequest req, StreamObserver<CancelProjectsReply> responseObserver) {
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
        CancelProjectsReply.newBuilder()
            .setMessage("Cancel getting projects requested")
            .build());
  }

  private void replyWithCancelError(Exception e) {
    responseObserver.onNext(CancelProjectsReply.newBuilder().setMessage(e.getMessage()).build());
  }
}
