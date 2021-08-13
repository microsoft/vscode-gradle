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
import com.github.badsyntax.gradle.GetDependenciesReply;
import com.github.badsyntax.gradle.GetDependenciesRequest;
import com.github.badsyntax.gradle.GradleProjectConnector;
import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleModelAction;
import com.microsoft.gradle.api.GradleToolingModel;
import io.grpc.stub.StreamObserver;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import org.gradle.tooling.BuildActionExecuter;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GetDependenciesHandler {
  private static final Logger logger =
      LoggerFactory.getLogger(GetDependenciesHandler.class.getName());

  private GetDependenciesRequest req;
  private StreamObserver<GetDependenciesReply> responseObserver;

  public GetDependenciesHandler(
      GetDependenciesRequest req, StreamObserver<GetDependenciesReply> responseObserver) {
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
      BuildActionExecuter<GradleToolingModel> action = connection.action(new GradleModelAction());
      File initScript = File.createTempFile("init-build", ".gradle");
      initScript.deleteOnExit();
      File pluginFile = File.createTempFile("custom-plugin", ".jar");
      pluginFile.deleteOnExit();
      createPluginJar("/gradle-plugin.jar", pluginFile);
      createTemplateScript(pluginFile, initScript);
      action.withArguments("--init-script", initScript.getAbsolutePath());
      GradleToolingModel gradleModel = action.run();
      GradleDependencyNode root = gradleModel.getDependencyNode();
      responseObserver.onNext(
          GetDependenciesReply.newBuilder().setItem(getDependencyItem(root)).build());
      responseObserver.onCompleted();
    } catch (IOException e) {
      logger.error(e.getMessage());
      responseObserver.onError(ErrorMessageBuilder.build(e));
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

  private void createPluginJar(String resource, File outputFile) throws IOException {
    InputStream input = GetDependenciesHandler.class.getResourceAsStream(resource);
    Files.copy(input, outputFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
    input.close();
  }

  private void createTemplateScript(File pluginFile, File outputFile) throws IOException {
    String pluginFilePath = pluginFile.getAbsolutePath().replace("\\", "/");
    String template =
        "initscript {\n"
            + "    dependencies {\n"
            + "        classpath files('"
            + pluginFilePath
            + "')\n"
            + "    }\n"
            + "}\n"
            + "\n"
            + "allprojects {\n"
            + "    apply plugin: com.microsoft.gradle.GradlePlugin\n"
            + "}\n";
    Files.writeString(outputFile.toPath(), template);
  }
}
