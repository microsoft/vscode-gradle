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
package com.microsoft.gradle.handlers;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.microsoft.gradle.delegate.GradleDelegate;
import com.microsoft.gradle.resolver.GradleClosure;
import com.microsoft.gradle.resolver.GradleLibraryResolver;
import com.microsoft.gradle.resolver.GradleMethod;

import org.apache.bcel.classfile.JavaClass;
import org.apache.bcel.classfile.Method;
import org.apache.bcel.generic.ObjectType;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.InsertTextFormat;

public class CompletionHandler {

  private static String BUILD_GRADLE = "build.gradle";
  private static String SETTING_GRADLE = "settings.gradle";
  private static String DEPENDENCYHANDLER_CLASS = "org.gradle.api.artifacts.dsl.DependencyHandler";

  public List<CompletionItem> getCompletionItems(MethodCallExpression containingCall, String fileName, GradleLibraryResolver resolver, boolean javaPluginsIncluded) {
    List<CompletionItem> results = new ArrayList<>();
    Set<String> resultSet = new HashSet<>();
    String delegateClassName = null;
    if (containingCall == null) {
      if (fileName.equals(BUILD_GRADLE)) {
        delegateClassName = GradleDelegate.getDefault();
      } else if (fileName.equals(SETTING_GRADLE)) {
        delegateClassName = GradleDelegate.getSettings();
      }
      results.addAll(getCompletionItemsFromExtClosures(resolver, resultSet));
    } else {
      String methodName = containingCall.getMethodAsString();
      results.addAll(getCompletionItemsFromExtClosures(resolver, methodName, resultSet));
      delegateClassName = GradleDelegate.getDelegateMap().get(methodName);
    }
    if (delegateClassName == null) {
      return results;
    }
    JavaClass delegateClass = resolver.getGradleClasses().get(delegateClassName);
    if (delegateClass == null) {
      return results;
    }
    results.addAll(getCompletionItemsFromClass(delegateClass, resolver, javaPluginsIncluded, resultSet));
    return results;
  }

  private List<CompletionItem> getCompletionItemsFromClass(JavaClass javaClass, GradleLibraryResolver resolver, boolean javaPluginsIncluded, Set<String> resultSet) {
    if (javaClass == null) {
      return Collections.emptyList();
    }
    List<CompletionItem> results = new ArrayList<>();
    for (String superInterface : javaClass.getInterfaceNames()) {
      if (resolver.getGradleClasses().containsKey(superInterface)) {
        results.addAll(getCompletionItemsFromClass(resolver.getGradleClasses().get(superInterface), resolver, javaPluginsIncluded, resultSet));
      }
    }
    String superClass = javaClass.getSuperclassName();
    if (resolver.getGradleClasses().containsKey(superClass)) {
      results.addAll(getCompletionItemsFromClass(resolver.getGradleClasses().get(superClass), resolver, javaPluginsIncluded, resultSet));
    }
    List<String> methodNames = new ArrayList<>();
    Method[] methods = javaClass.getMethods();
    for (Method method : methods) {
      String methodName = method.getName();
      // When parsing a abstract class, we'll get a "<init>" method which can't be called directly,
      // So we filter it here.
      if (methodName.equals("<init>")) {
        continue;
      }
      methodNames.add(methodName);
      List<String> arguments = new ArrayList<>();
      Arrays.asList(method.getArgumentTypes()).forEach(type -> {
        if (type instanceof ObjectType) {
          arguments.add(((ObjectType) type).getClassName());
        }
      });
      CompletionItem item = generateCompletionItemForMethod(methodName, arguments);
      if (resultSet.add(item.getLabel())) {
        results.add(item);
      }
    }
    for (String methodName : methodNames) {
      if (methodName.startsWith("set") && methodName.length() > 3) {
        // for cases like setVersion() and getVersion(),
        // we offer version as a property
        String getMethod = "get" + methodName.substring(3);
        if (methodNames.contains(getMethod)) {
          String property = methodName.substring(3, 4).toLowerCase() + methodName.substring(4);
          CompletionItem item = new CompletionItem(property);
          item.setKind(CompletionItemKind.Property);
          if (resultSet.add(property)) {
            results.add(item);
          }
        }
      }
    }
    if (javaPluginsIncluded && javaClass.getClassName().equals(DEPENDENCYHANDLER_CLASS)) {
      // for dependency {}, we offer java configurations if there is any applied java plugin
      for (String plugin : resolver.getJavaConfigurations()) {
        StringBuilder builder = new StringBuilder();
        builder.append(plugin);
        builder.append("(Object... o)");
        StringBuilder insertBuilder = new StringBuilder();
        insertBuilder.append(plugin);
        insertBuilder.append("($0)");
        CompletionItem item = new CompletionItem(builder.toString());
        item.setKind(CompletionItemKind.Function);
        item.setInsertTextFormat(InsertTextFormat.Snippet);
        item.setInsertText(insertBuilder.toString());
        results.add(item);
      }
    }
    return results;
  }

  private List<CompletionItem> getCompletionItemsFromExtClosures(GradleLibraryResolver resolver, Set<String> resultSet) {
    Map<String, GradleClosure> extClosures = resolver.getExtClosures();
    if (extClosures == null || extClosures.isEmpty()) {
      return Collections.emptyList();
    }
    List<CompletionItem> results = new ArrayList<>();
    for (String closure : extClosures.keySet()) {
      StringBuilder titleBuilder = new StringBuilder();
      titleBuilder.append(closure);
      titleBuilder.append("(Closure c)");
      CompletionItem item = new CompletionItem(titleBuilder.toString());
      item.setKind(CompletionItemKind.Function);
      item.setInsertTextFormat(InsertTextFormat.Snippet);
      StringBuilder insertTextBuilder = new StringBuilder();
      insertTextBuilder.append(closure);
      insertTextBuilder.append(" {$0}");
      item.setInsertText(insertTextBuilder.toString());
      if (resultSet.add(item.getLabel())) {
        results.add(item);
      }
    }
    return results;
  }

  private List<CompletionItem> getCompletionItemsFromExtClosures(GradleLibraryResolver resolver, String closureName, Set<String> resultSet) {
    Map<String, GradleClosure> extClosures = resolver.getExtClosures();
    if (extClosures == null || extClosures.isEmpty() || !extClosures.containsKey(closureName)) {
      return Collections.emptyList();
    }
    List<CompletionItem> results = new ArrayList<>();
    GradleClosure closure = extClosures.get(closureName);
    for (GradleMethod method : closure.methods) {
      CompletionItem item = generateCompletionItemForMethod(method.name, Arrays.asList(method.parameterTypes));
      if (resultSet.add(item.getLabel())) {
        results.add(item);
      }
    }
    return results;
  }

  private static CompletionItem generateCompletionItemForMethod(String name, List<String> arguments) {
    StringBuilder labelBuilder = new StringBuilder();
    labelBuilder.append(name);
    labelBuilder.append("(");
    for (int i = 0; i < arguments.size(); i++) {
      String type = arguments.get(i);
      String[] classNameSplits = type.split("\\.");
      String className = classNameSplits[classNameSplits.length - 1];
      String variableName = className.substring(0, 1).toLowerCase();
      labelBuilder.append(className);
      labelBuilder.append(" ");
      labelBuilder.append(variableName);
      if (i != arguments.size() - 1) {
        labelBuilder.append(", ");
      }
    }
    labelBuilder.append(")");
    String label = labelBuilder.toString();
    CompletionItem item = new CompletionItem(label);
    item.setKind(CompletionItemKind.Function);
    item.setInsertTextFormat(InsertTextFormat.Snippet);
    StringBuilder builder = new StringBuilder();
    builder.append(name);
    if (label.endsWith("(Closure c)")) {
      // for single closure, we offer curly brackets
      builder.append(" {$0}");
    } else {
      builder.append("($0)");
    }
    item.setInsertText(builder.toString());
    return item;
  }
}
