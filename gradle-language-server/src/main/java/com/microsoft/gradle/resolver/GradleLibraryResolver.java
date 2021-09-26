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

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.bcel.classfile.ClassFormatException;
import org.apache.bcel.classfile.ClassParser;
import org.apache.bcel.classfile.Field;
import org.apache.bcel.classfile.JavaClass;

public class GradleLibraryResolver {

  private static String JAVA_PLUGIN = "org.gradle.api.plugins.JavaPlugin";

  private Map<String, JavaClass> gradleLibraries = new HashMap<>();
  private Set<String> javaConfigurations = new HashSet<>();
  private Set<String> javaPlugins = new HashSet<>();
  private String gradleHome;
  private String gradleVersion;
  private boolean gradleWrapperEnabled;
  private String gradleUserHome;
  private Path workspacePath;
  private File libFile;
  private File pluginLibFile;

  public GradleLibraryResolver() {
    this.javaPlugins.addAll(Arrays.asList("java", "application", "groovy", "java-library", "war"));
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

  public Map<String, JavaClass> getGradleLibraries() {
    return this.gradleLibraries;
  }

  public Set<String> getJavaConfigurations() {
    return this.javaConfigurations;
  }

  public boolean resolveLibFiles() {
    Path gradleUserHomePath = (this.gradleUserHome == null) ? Path.of(System.getProperty("user.home"), ".gradle")
        : Path.of(this.gradleUserHome);
    if (this.gradleWrapperEnabled) {
      this.libFile = findLibWithWrapper(gradleUserHomePath);
    } else if (this.gradleVersion != null) {
      this.libFile = findLibWithDist(gradleUserHomePath, "gradle-" + this.gradleVersion);
    } else if (this.gradleHome != null) {
      this.libFile = findLibFile(Path.of(this.gradleHome).resolve("lib").toFile());
    } else {
      return false;
    }
    if (!isValidFile(this.libFile)) {
      return false;
    }
    this.pluginLibFile = findPluginLibFile(libFile.toPath().getParent().resolve(Path.of("plugins")).toFile());
    return isValidFile(this.pluginLibFile);
  }

  public void resolve() {
    if ((!isValidFile(this.libFile) || !isValidFile(this.pluginLibFile)) && !this.resolveLibFiles()) {
      return;
    }
    try {
      JarFile libJar = new JarFile(this.libFile);
      getGradleLibraries(libFile.toPath(), libJar);
      JarFile pluginLibJar = new JarFile(this.pluginLibFile);
      getGradleLibraries(pluginLibFile.toPath(), pluginLibJar);
      resolveJavaConfigurations();
    } catch (Exception e) {
      // Do Nothing
    }
  }

  private File findLibWithWrapper(Path gradleUserHomePath) {
    if (this.workspacePath == null) {
      return null;
    }
    Path propertiesRelativePath = Path.of("gradle", "wrapper", "gradle-wrapper.properties");
    Path propertiesPath = this.workspacePath.resolve(propertiesRelativePath);
    File propertiesFile = propertiesPath.toFile();
    if (!propertiesFile.exists()) {
      return null;
    }
    try (FileInputStream stream = new FileInputStream(propertiesFile)) {
      BufferedReader reader = new BufferedReader(new InputStreamReader(stream));
      String content = null;
      while ((content = reader.readLine()) != null) {
        if (content.startsWith("distributionUrl")) {
          Pattern p = Pattern.compile("(gradle-(?s)(.*))-bin");
          Matcher matcher = p.matcher(content);
          if (matcher.find()) {
            String gradleDist = matcher.group(1);
            return findLibWithDist(gradleUserHomePath, gradleDist);
          }
        }
      }
    } catch (IOException e) {
      // Do Nothing
    }
    return null;
  }

  private File findLibWithDist(Path gradleUserHomePath, String gradleDist) {
    Path distPath = gradleUserHomePath.resolve(Path.of("wrapper", "dists"));
    File distFolder = searchInFolder(gradleDist, distPath.toFile());
    if (distFolder != null && distFolder.exists()) {
      Path libPath = distFolder.toPath().resolve("lib");
      return findLibFile(libPath.toFile());
    }
    return null;
  }

  private File searchInFolder(String gradleDist, File folder) {
    for (File file : folder.listFiles()) {
      if (file.isDirectory()) {
        if (file.getName().equals(gradleDist)) {
          return file;
        } else {
          File searchResult = searchInFolder(gradleDist, file);
          if (searchResult != null) {
            return searchResult;
          }
        }
      }
    }
    return null;
  }

  private File findLibFile(File folder) {
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

  private File findPluginLibFile(File folder) {
    for (File file : folder.listFiles()) {
      String name = file.getName();
      if (name.startsWith("gradle-plugins") && name.endsWith(".jar")) {
        return file;
      }
    }
    return null;
  }

  private void getGradleLibraries(Path jarPath, JarFile jarFile) {
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
        this.gradleLibraries.put(className, javaClass);
      } catch (IOException | ClassFormatException e) {
        // Do Nothing
      }
    }
  }

  private void resolveJavaConfigurations() {
    JavaClass javaPluginClass = this.gradleLibraries.get(GradleLibraryResolver.JAVA_PLUGIN);
    if (javaPluginClass == null) {
      return;
    }
    for (Field field : javaPluginClass.getFields()) {
      if (field.getName().endsWith("CONFIGURATION_NAME")) {
        this.javaConfigurations.add(removeQuotes(field.getConstantValue().toString()));
      }
    }
  }

  private static String removeQuotes(String original) {
    // for those fields parsed from class files, we get ""values"", so we remove the
    // starting and ending quotes here
    if (original.length() < 3) {
      return original;
    }
    return original.substring(1, original.length() - 1);
  }

  public boolean isJavaPluginsIncluded(Set<String> plugins) {
    for (String plugin : plugins) {
      if (this.javaPlugins.contains(plugin)) {
        return true;
      }
    }
    return false;
  }

  private static boolean isValidFile(File file) {
    return file != null && file.exists();
  }
}
