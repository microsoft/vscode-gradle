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

import com.github.badsyntax.gradle.ErrorMessageBuilder;
import com.github.badsyntax.gradle.GetPluginsReply;
import com.github.badsyntax.gradle.GetPluginsRequest;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.Method;
import com.github.badsyntax.gradle.PluginClosure;
import com.github.badsyntax.gradle.PluginItem;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.github.badsyntax.gradle.utils.PluginUtils;
import com.microsoft.gradle.api.plugin.GradleMethod;
import com.microsoft.gradle.api.plugin.GradlePluginAction;
import com.microsoft.gradle.api.plugin.GradlePluginClosure;
import com.microsoft.gradle.api.plugin.GradlePluginModel;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.io.IOException;
import org.gradle.tooling.BuildActionExecuter;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GetPluginsHandler {
  private static final Logger logger = LoggerFactory.getLogger(GetPluginsHandler.class.getName());

  private GetPluginsRequest req;
  private StreamObserver<GetPluginsReply> responseObserver;

  public GetPluginsHandler(
      GetPluginsRequest req, StreamObserver<GetPluginsReply> responseObserver) {
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
      BuildActionExecuter<GradlePluginModel> action = connection.action(new GradlePluginAction());
      File initScript = PluginUtils.createInitScript();
      action.withArguments("--init-script", initScript.getAbsolutePath());
      GradlePluginModel pluginModel = action.run();
      responseObserver.onNext(
          GetPluginsReply.newBuilder().setItem(getPluginItem(pluginModel)).build());
      responseObserver.onCompleted();
    } catch (IOException e) {
      logger.error(e.getMessage());
      responseObserver.onError(ErrorMessageBuilder.build(e));
    }
  }

  private PluginItem getPluginItem(GradlePluginModel pluginModel) {
    PluginItem.Builder item = PluginItem.newBuilder();
    item.addAllPlugins(pluginModel.getPluginItem().getPlugins());
    for (GradlePluginClosure closure : pluginModel.getPluginItem().getClosures()) {
      PluginClosure.Builder closureBuilder = PluginClosure.newBuilder();
      for (GradleMethod method : closure.getMethods()) {
        Method.Builder methodBuilder = Method.newBuilder();
        methodBuilder.setName(method.getName());
        methodBuilder.addAllParameterTypes(method.getParameterTypes());
        closureBuilder.addMethods(methodBuilder.build());
      }
      closureBuilder.setName(closure.getName());
      closureBuilder.addAllFields(closure.getFields());
      item.addClosures(closureBuilder.build());
    }
    return item.build();
  }
}
