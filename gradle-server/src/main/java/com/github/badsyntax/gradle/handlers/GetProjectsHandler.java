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

import com.github.badsyntax.gradle.DependencyItem;
import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GetProjectsReply;
import com.github.badsyntax.gradle.GetProjectsRequest;
import com.github.badsyntax.gradle.GradleBuildCancellation;
import com.github.badsyntax.gradle.GradleClosure;
import com.github.badsyntax.gradle.GradleMethod;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.github.badsyntax.gradle.utils.PluginUtils;
import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleModelAction;
import com.microsoft.gradle.api.GradleProjectModel;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.gradle.tooling.BuildActionExecuter;
import org.gradle.tooling.BuildCancelledException;
import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GetProjectsHandler {
  private static final Logger logger = LoggerFactory.getLogger(GetProjectsHandler.class.getName());

  private GetProjectsRequest req;
  private StreamObserver<GetProjectsReply> responseObserver;

  public GetProjectsHandler(
      GetProjectsRequest req, StreamObserver<GetProjectsReply> responseObserver) {
    this.req = req;
    this.responseObserver = responseObserver;
  }

  public void run() {
    GradleConnector gradleConnector;
    try {
      gradleConnector = GradleProjectConnector.build(req.getProjectDir(), req.getGradleConfig());
    } catch (GradleConnectionException e) {
      logger.error(e.getMessage());
      responseObserver.onError(ErrorMessageBuilder.build(e));
      return;
    }

    try (ProjectConnection connection = gradleConnector.connect()) {
      BuildActionExecuter<GradleProjectModel> action = connection.action(new GradleModelAction());
      File initScript = PluginUtils.createInitScript();
      action.withArguments("--init-script", initScript.getAbsolutePath());
      CancellationToken cancellationToken =
          GradleBuildCancellation.buildToken(req.getCancellationKey());
      action.withCancellationToken(cancellationToken);
      GradleProjectModel gradleModel = action.run();
      GradleDependencyNode root = gradleModel.getDependencyNode();
      responseObserver.onNext(
          GetProjectsReply.newBuilder()
              .setItem(getDependencyItem(root))
              .addAllPlugins(gradleModel.getPlugins())
              .addAllPluginClosures(getPluginClosures(gradleModel))
              .build());
      responseObserver.onCompleted();
    } catch (IOException e) {
      logger.error(e.getMessage());
      responseObserver.onError(ErrorMessageBuilder.build(e));
    } catch (BuildCancelledException e) {
      replyWithCancelled();
    } finally {
      GradleBuildCancellation.clearToken(req.getCancellationKey());
    }
  }

  private DependencyItem getDependencyItem(GradleDependencyNode node) {
    DependencyItem.Builder item = DependencyItem.newBuilder();
    item.setName(node.getName());
    item.setTypeValue(node.getType().ordinal());
    if (node.getChildren() == null) {
      return item.build();
    }
    List<DependencyItem> children = new ArrayList<>();
    for (GradleDependencyNode child : node.getChildren()) {
      children.add(getDependencyItem(child));
    }
    item.addAllChildren(children);
    return item.build();
  }

  private List<GradleClosure> getPluginClosures(GradleProjectModel model) {
    List<GradleClosure> closures = new ArrayList<>();
    for (com.microsoft.gradle.api.GradleClosure closure : model.getClosures()) {
      GradleClosure.Builder closureBuilder = GradleClosure.newBuilder();
      for (com.microsoft.gradle.api.GradleMethod method : closure.getMethods()) {
        GradleMethod.Builder methodBuilder = GradleMethod.newBuilder();
        methodBuilder.setName(method.getName());
        methodBuilder.addAllParameterTypes(method.getParameterTypes());
        closureBuilder.addMethods(methodBuilder.build());
      }
      closureBuilder.setName(closure.getName());
      closureBuilder.addAllFields(closure.getFields());
      closures.add(closureBuilder.build());
    }
    return closures;
  }

  private void replyWithCancelled() {
    responseObserver.onNext(GetProjectsReply.newBuilder().build());
    responseObserver.onCompleted();
  }
}
