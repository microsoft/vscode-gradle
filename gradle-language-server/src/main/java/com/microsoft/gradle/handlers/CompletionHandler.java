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

  public List<CompletionItem> getRootCompletionItems(GradleLibraryResolver resolver) {
    List<CompletionItem> result = new ArrayList<>();
    List<String> candidateClasses = new ArrayList<>();
    candidateClasses.add("org.gradle.api.Project");
    candidateClasses.add("org.gradle.api.plugins.PluginAware");
    for (String candidateClass : candidateClasses) {
      result.addAll(getCompletionItemsFromClass(resolver.getGradleLibraries().get(candidateClass)));
    }
    return result;
  }

  public List<CompletionItem> getCompletionItems(List<MethodCallExpression> containingCalls,
      GradleLibraryResolver resolver) {
    List<String> candidateClasses = new ArrayList<>();
    candidateClasses.add("org.gradle.api.Project");
    candidateClasses.add("org.gradle.api.plugins.PluginAware");
    List<Method> matchedMethods = new ArrayList<>();
    for (int i = 0; i < containingCalls.size(); i++) {
      matchedMethods.clear();
      MethodCallExpression call = containingCalls.get(i);
      String methodName = call.getMethodAsString();
      for (String candidateClass : candidateClasses) {
        JavaClass javaClass = resolver.getGradleLibraries().get(candidateClass);
        if (javaClass == null) {
          continue;
        }
        matchedMethods.addAll(findMatchedMethods(methodName, javaClass));
      }
      if (i == containingCalls.size() - 1) {
        // current is the last Closure
        List<CompletionItem> results = new ArrayList<>();
        // make sure result type is unique
        Set<Type> typeSets = new HashSet<>();
        for (Method method : matchedMethods) {
          Type returnType = method.getReturnType();
          if (checkValidMethod(method) && typeSets.add(returnType)) {
            String className = ((ObjectType) returnType).getClassName();
            results.addAll(getCompletionItemsFromClass(resolver.getGradleLibraries().get(className)));
          }
        }
        return results;
      }
      candidateClasses.clear();
      for (Method method : matchedMethods) {
        candidateClasses.add(((ObjectType)method.getReturnType()).getClassName());
      }
    }
    return Collections.emptyList();
  }

  private List<Method> findMatchedMethods(String methodName, JavaClass javaClass) {
    List<Method> matchedMethods = new ArrayList<>();
    Method[] methods = javaClass.getMethods();
    for (Method method : methods) {
      String name = method.getName();
      if (!checkValidMethod(method)) {
        continue;
      }
      if (name.equals(methodName)) {
        // full match
        matchedMethods.add(method);
      } else if (methodName.length() > 0
          && name.equals("get" + methodName.substring(0, 1).toUpperCase() + methodName.substring(1))) {
        // matches dependencies -> getDependencies()
        matchedMethods.add(method);
      }
    }
    return matchedMethods;
  }

  private static boolean checkValidMethod(Method method) {
    return method.getReturnType() instanceof ObjectType;
  }

  private List<CompletionItem> getCompletionItemsFromClass(JavaClass javaClass) {
    if (javaClass == null) {
      return Collections.emptyList();
    }
    List<CompletionItem> results = new ArrayList<>();
    List<String> methodNames = new ArrayList<>();
    Set<String> resultSet = new HashSet<>();
    Method[] methods = javaClass.getMethods();
    for (Method method : methods) {
      StringBuilder labelBuilder = new StringBuilder();
      String methodName = method.getName();
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
      if (label.endsWith("(Closure c)")) {
        // handle single closure case
        StringBuilder closureInsertBuilder = new StringBuilder();
        closureInsertBuilder.append(methodName);
        closureInsertBuilder.append(" {$0}");
        item.setInsertText(closureInsertBuilder.toString());
        item.setInsertTextFormat(InsertTextFormat.Snippet);
      } else {
        item.setInsertText(methodName);
      }
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
