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

package com.github.badsyntax.gradle.utils;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

public class PluginUtils {
  public static File createInitScript() throws IOException {
    File initScript = File.createTempFile("init-build", ".gradle");
    initScript.deleteOnExit();
    File pluginFile = File.createTempFile("custom-plugin", ".jar");
    pluginFile.deleteOnExit();
    createPluginJar("/gradle-plugin.jar", pluginFile);
    createTemplateScript(pluginFile, initScript);
    return initScript;
  }

  private static void createPluginJar(String resource, File outputFile) throws IOException {
    InputStream input = PluginUtils.class.getResourceAsStream(resource);
    Files.copy(input, outputFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
    input.close();
  }

  private static void createTemplateScript(File pluginFile, File outputFile) throws IOException {
    String pluginFilePath = pluginFile.getAbsolutePath().replace("\\", "/");
    // @formatter:off
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
    // @formatter:on
    Files.write(outputFile.toPath(), template.getBytes());
  }
}
