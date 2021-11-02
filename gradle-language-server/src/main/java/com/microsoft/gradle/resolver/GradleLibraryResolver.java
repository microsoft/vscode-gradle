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
package com.microsoft.gradle.resolver;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URL;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

import com.microsoft.gradle.utils.Utils;

import org.apache.bcel.classfile.ClassFormatException;
import org.apache.bcel.classfile.ClassParser;
import org.apache.bcel.classfile.Field;
import org.apache.bcel.classfile.JavaClass;

public class GradleLibraryResolver {

  private static String JAVA_PLUGIN = "org.gradle.api.plugins.JavaPlugin";

  private Map<String, JavaClass> gradleClasses = new HashMap<>();
  private Set<String> javaConfigurations = new HashSet<>();
  private Set<String> javaPlugins = new HashSet<>();
  private Set<String> projectPlugins = new HashSet<>();
  private Map<String, GradleClosure> extClosures = new HashMap<>();
  private String gradleHome;
  private String gradleVersion;
  private boolean gradleWrapperEnabled;
  private String gradleUserHome;
  private Path workspacePath;
  private File coreAPI;
  private File pluginAPI;
  private boolean needToLoadClasses;

  public GradleLibraryResolver() {
    this.javaPlugins.addAll(Arrays.asList("java", "application", "groovy", "java-library", "war"));
    this.needToLoadClasses = true;
  }

  public void setGradleHome(String gradleHome) {
    this.gradleHome = gradleHome;
  }

  public void setGradleVersion(String gradleVersion) {
    this.gradleVersion = gradleVersion;
  }

  public void setGradleWrapperEnabled(boolean gradleWrapperEnabled) {
    this.gradleWrapperEnabled = gradleWrapperEnabled;
  }

  public void setGradleUserHome(String gradleUserHome) {
    this.gradleUserHome = gradleUserHome;
  }

  public void setWorkspacePath(Path workspacePath) {
    this.workspacePath = workspacePath;
  }

  public Map<String, JavaClass> getGradleClasses() {
    return this.gradleClasses;
  }

  public Set<String> getJavaConfigurations() {
    return this.javaConfigurations;
  }

  public boolean resolveGradleAPI() {
    this.needToLoadClasses = true;
    Path gradleUserHomePath = (this.gradleUserHome == null) ? Paths.get(System.getProperty("user.home"), ".gradle")
        : Paths.get(this.gradleUserHome);
    if (this.gradleWrapperEnabled) {
      this.coreAPI = findCoreAPIWithWrapper(gradleUserHomePath);
    } else if (this.gradleVersion != null) {
      this.coreAPI = findCoreAPIWithDist(gradleUserHomePath.resolve(Paths.get("wrapper", "dists")), "gradle-" + this.gradleVersion);
    } else if (this.gradleHome != null) {
      this.coreAPI = findCoreAPI(Paths.get(this.gradleHome).resolve("lib").toFile());
    } else {
      return false;
    }
    if (!Utils.isValidFile(this.coreAPI)) {
      return false;
    }
    this.pluginAPI = findPluginAPI(this.coreAPI.toPath().getParent().resolve(Paths.get("plugins")).toFile());
    return Utils.isValidFile(this.pluginAPI);
  }

  public void loadGradleClasses() {
    boolean isAPIValid = Utils.isValidFile(this.coreAPI) && Utils.isValidFile(this.pluginAPI);
    if (!this.needToLoadClasses || (!isAPIValid && !this.resolveGradleAPI())) {
      return;
    }
    try {
      JarFile coreAPIJar = new JarFile(this.coreAPI);
      loadClasses(this.coreAPI.toPath(), coreAPIJar);
      JarFile pluginAPIJar = new JarFile(this.pluginAPI);
      loadClasses(this.pluginAPI.toPath(), pluginAPIJar);
      loadJavaConfigurations();
      this.needToLoadClasses = false;
    } catch (Exception e) {
      // Do Nothing
    }
  }

  private File findCoreAPIWithWrapper(Path gradleUserHomePath) {
    if (this.workspacePath == null) {
      return null;
    }
    Path propertiesRelativePath = Paths.get("gradle", "wrapper", "gradle-wrapper.properties");
    Path propertiesPath = this.workspacePath.resolve(propertiesRelativePath);
    File propertiesFile = propertiesPath.toFile();
    if (!propertiesFile.exists()) {
      return null;
    }
    Properties properties = new Properties();
    try (FileInputStream stream = new FileInputStream(propertiesFile)) {
      properties.load(stream);
      String distributionBase = properties.getProperty("distributionBase");
      // We use default values if the properties are not specified
      // See: https://docs.gradle.org/current/dsl/org.gradle.api.tasks.wrapper.Wrapper.html#N30F30
      if (distributionBase == null) {
        distributionBase = "GRADLE_USER_HOME";
      }
      Path pathBase = getDistributionBase(distributionBase, gradleUserHomePath, this.workspacePath);
      if (pathBase == null) {
        return null;
      }
      String distributionPath = properties.getProperty("distributionPath");
      if (distributionPath == null) {
        distributionPath = "wrapper/dists";
      }
      Path distPath = pathBase.resolve(distributionPath);
      String distributionUrl = properties.getProperty("distributionUrl");
      // if distributionUrl is not specified, the import process will not be successful
      if (distributionUrl == null) {
        return null;
      }
      Path fileName = Paths.get(new URL(distributionUrl).getPath()).getFileName();
      return findCoreAPIWithDist(distPath, Utils.getFileNameWithoutExtension(fileName));
    } catch (IOException e) {
      return null;
    }
  }

  private File findCoreAPIWithDist(Path distPath, String gradleDist) {
    File distFolder = distPath.toFile();
    // distFolder matches .gradle/wrapper/dists
    if (!Utils.isValidFolder(distFolder)) {
      return null;
    }
    File targetFolder = Utils.findSubFolder(distFolder, gradleDist);
    // targetFolder matches .gradle/wrapper/dists/${gradleDist}
    if (!Utils.isValidFolder(targetFolder)) {
      return null;
    }
    for (File internalValueFolder : targetFolder.listFiles()) {
      if (Utils.isValidFolder(internalValueFolder)) {
        // internalValueFolder matches .gradle/wrapper/dists/${gradleDist}/internal-string
        for (File extractFolder : internalValueFolder.listFiles()) {
          if (Utils.isValidFolder(extractFolder)) {
            // extractFolder matches .gradle/wrapper/dists/${gradleDist}/internal-string/${gradleVersion}
            File libFolder = extractFolder.toPath().resolve("lib").toFile();
            // libFolder matches .gradle/wrapper/dists/${gradleDist}/internal-string/${gradleVersion}/lib
            if (Utils.isValidFolder(libFolder)) {
              return findCoreAPI(libFolder);
            }
          }
        }
      }
    }
    return null;
  }

  private File findCoreAPI(File folder) {
    for (File file : folder.listFiles()) {
      String name = file.getName();
      if (name.startsWith("gradle-core-api") && name.endsWith(".jar")) {
        return file;
      }
    }
    // For Gradle version under 5.6, the name of library file is like
    // gradle-core-${version}.jar
    for (File file : folder.listFiles()) {
      String name = file.getName();
      if (name.startsWith("gradle-core") && name.endsWith(".jar")) {
        return file;
      }
    }
    return null;
  }

  private File findPluginAPI(File folder) {
    for (File file : folder.listFiles()) {
      String name = file.getName();
      if (name.startsWith("gradle-plugins") && name.endsWith(".jar")) {
        return file;
      }
    }
    return null;
  }

  private void loadClasses(Path jarPath, JarFile jarFile) {
    Enumeration<JarEntry> entries = jarFile.entries();
    while (entries.hasMoreElements()) {
      JarEntry entry = entries.nextElement();
      if (!entry.getName().endsWith(".class")) {
        continue;
      }
      ClassParser parser = new ClassParser(jarPath.toString(), entry.getName());
      try {
        JavaClass javaClass = parser.parse();
        String className = javaClass.getClassName();
        this.gradleClasses.put(className, javaClass);
      } catch (IOException | ClassFormatException e) {
        // Do Nothing
      }
    }
  }

  private void loadJavaConfigurations() {
    JavaClass javaPluginClass = this.gradleClasses.get(GradleLibraryResolver.JAVA_PLUGIN);
    if (javaPluginClass == null) {
      return;
    }
    for (Field field : javaPluginClass.getFields()) {
      if (field.getName().endsWith("CONFIGURATION_NAME")) {
        this.javaConfigurations.add(removeQuotes(field.getConstantValue().toString()));
      }
    }
  }

  public void setExtClosures(List<GradleClosure> closures) {
    this.extClosures.clear();
    for (GradleClosure closure : closures) {
      this.extClosures.put(closure.name, closure);
    }
  }

  public Map<String, GradleClosure> getExtClosures() {
    return this.extClosures;
  }

  private static String removeQuotes(String original) {
    // for those fields parsed from class files, we get ""values"", so we remove the
    // starting and ending quotes here
    if (original.length() < 3) {
      return original;
    }
    return original.substring(1, original.length() - 1);
  }

  public void setProjectPlugins(List<String> plugins) {
    this.projectPlugins.clear();
    this.projectPlugins.addAll(plugins);
  }

  public boolean isJavaPluginsIncluded(Set<String> plugins) {
    if (this.projectPlugins.contains("java")) {
      return true;
    }
    for (String plugin : plugins) {
      if (this.javaPlugins.contains(plugin)) {
        return true;
      }
    }
    return false;
  }

  private static Path getDistributionBase(String distributionBase, Path gradleUserHomePath, Path workspacePath) {
    // See: https://docs.gradle.org/current/javadoc/org/gradle/api/tasks/wrapper/Wrapper.PathBase.html
    if (distributionBase.equals("GRADLE_USER_HOME")) {
      return gradleUserHomePath;
    } else if (distributionBase.equals("PROJECT")) {
      return workspacePath;
    }
    return null;
  }
}
