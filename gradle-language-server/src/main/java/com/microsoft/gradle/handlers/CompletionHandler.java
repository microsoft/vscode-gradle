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
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.microsoft.gradle.delegate.GradleDelegate;
import com.microsoft.gradle.resolver.GradleLibraryResolver;

import org.apache.bcel.classfile.JavaClass;
import org.apache.bcel.classfile.Method;
import org.apache.bcel.generic.ObjectType;
import org.apache.bcel.generic.Type;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.InsertTextFormat;

public class CompletionHandler {

  private static String BUILD_GRADLE = "build.gradle";
  private static String SETTING_GRADLE = "settings.gradle";

  public List<CompletionItem> getCompletionItems(MethodCallExpression containingCall, String fileName, GradleLibraryResolver resolver) {
    String delegateClassName = null;
    if (containingCall == null) {
      if (fileName.equals(BUILD_GRADLE)) {
        delegateClassName = GradleDelegate.getDefault();
      } else if (fileName.equals(SETTING_GRADLE)) {
        delegateClassName = GradleDelegate.getSettings();
      }
    } else {
      delegateClassName = GradleDelegate.getDelegateMap().get(containingCall.getMethodAsString());
    }
    if (delegateClassName == null) {
      return Collections.emptyList();
    }
    JavaClass delegateClass = resolver.getGradleLibraries().get(delegateClassName);
    if (delegateClass == null) {
      return Collections.emptyList();
    }
    return getCompletionItemsFromClass(delegateClass, resolver, new HashSet<>());
  }

  private List<CompletionItem> getCompletionItemsFromClass(JavaClass javaClass, GradleLibraryResolver resolver, Set<String> resultSet) {
    if (javaClass == null) {
      return Collections.emptyList();
    }
    List<CompletionItem> results = new ArrayList<>();
    for (String superInterface : javaClass.getInterfaceNames()) {
      if (resolver.getGradleLibraries().containsKey(superInterface)) {
        results.addAll(getCompletionItemsFromClass(resolver.getGradleLibraries().get(superInterface), resolver, resultSet));
      }
    }
    String superClass = javaClass.getSuperclassName();
    if (resolver.getGradleLibraries().containsKey(superClass)) {
      results.addAll(getCompletionItemsFromClass(resolver.getGradleLibraries().get(superClass), resolver, resultSet));
    }
    List<String> methodNames = new ArrayList<>();
    Method[] methods = javaClass.getMethods();
    for (Method method : methods) {
      StringBuilder labelBuilder = new StringBuilder();
      String methodName = method.getName();
      // When parsing a abstract class, we'll get a "<init>" method which can't be called directly,
      // So we filter it here.
      if (methodName.equals("<init>")) {
        continue;
      }
      methodNames.add(methodName);
      labelBuilder.append(methodName);
      labelBuilder.append("(");
      for (Type type : method.getArgumentTypes()) {
        if (type instanceof ObjectType) {
          String[] classNameSplits = ((ObjectType) type).getClassName().split("\\.");
          String className = classNameSplits[classNameSplits.length - 1];
          String variableName = className.substring(0, 1).toLowerCase();
          labelBuilder.append(className);
          labelBuilder.append(" ");
          labelBuilder.append(variableName);
          labelBuilder.append(",");
        }
      }
      if (labelBuilder.charAt(labelBuilder.length() - 1) == ',') {
        labelBuilder.deleteCharAt(labelBuilder.length() - 1);
      }
      labelBuilder.append(")");
      String label = labelBuilder.toString();
      CompletionItem item = new CompletionItem(label);
      item.setKind(CompletionItemKind.Function);
      item.setInsertTextFormat(InsertTextFormat.Snippet);
      StringBuilder builder = new StringBuilder();
      builder.append(methodName);
      if (label.endsWith("(Closure c)")) {
        // for single closure, we offer curly brackets
        builder.append(" {$0}");
      } else {
        builder.append("($0)");
      }
      item.setInsertText(builder.toString());
      if (resultSet.add(label)) {
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
    return results;
  }
}
