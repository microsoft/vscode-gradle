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

import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.microsoft.gradle.delegate.GradleDelegate;
import com.microsoft.gradle.resolver.GradleClosure;
import com.microsoft.gradle.resolver.GradleField;
import com.microsoft.gradle.resolver.GradleLibraryResolver;
import com.microsoft.gradle.resolver.GradleMethod;

import org.apache.bcel.classfile.Attribute;
import org.apache.bcel.classfile.FieldOrMethod;
import org.apache.bcel.classfile.JavaClass;
import org.apache.bcel.classfile.Method;
import org.apache.bcel.generic.ObjectType;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.CompletionItemTag;
import org.eclipse.lsp4j.InsertTextFormat;

public class CompletionHandler {

  private static String BUILD_GRADLE = "build.gradle";
  private static String SETTING_GRADLE = "settings.gradle";
  private static String DEPENDENCYHANDLER_CLASS = "org.gradle.api.artifacts.dsl.DependencyHandler";

  public List<CompletionItem> getCompletionItems(MethodCallExpression containingCall, String fileName, GradleLibraryResolver resolver, boolean javaPluginsIncluded) {
    List<CompletionItem> results = new ArrayList<>();
    Set<String> resultSet = new HashSet<>();
    List<String> delegateClassNames = new ArrayList<>();
    if (containingCall == null) {
      if (fileName.equals(BUILD_GRADLE)) {
        delegateClassNames.add(GradleDelegate.getDefault());
      } else if (fileName.equals(SETTING_GRADLE)) {
        delegateClassNames.add(GradleDelegate.getSettings());
      }
      results.addAll(getCompletionItemsFromExtClosures(resolver, resultSet));
    } else {
      String methodName = containingCall.getMethodAsString();
      List<CompletionItem> re = getCompletionItemsFromExtClosures(resolver, methodName, resultSet);
      results.addAll(re);
      List<String> delegates = GradleDelegate.getDelegateMap().get(methodName);
      if (delegates == null) {
        results.forEach(result -> setSortText(result));
        return results;
      }
      delegateClassNames.addAll(delegates);
    }
    if (delegateClassNames.isEmpty()) {
      return Collections.emptyList();
    }
    for (String delegateClassName : delegateClassNames) {
      JavaClass delegateClass = resolver.getGradleClasses().get(delegateClassName);
      if (delegateClass == null) {
        continue;
      }
      results.addAll(getCompletionItemsFromClass(delegateClass, resolver, javaPluginsIncluded, resultSet));
      break;
    }
    results.forEach(result -> setSortText(result));
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
      boolean isMethodDeprecated = isDeprecated(method);
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
      CompletionItem item = generateCompletionItemForMethod(methodName, arguments, isMethodDeprecated);
      if (resultSet.add(item.getLabel())) {
        results.add(item);
      }
      int modifiers = method.getModifiers();
      // See: https://docs.gradle.org/current/userguide/custom_gradle_types.html#managed_properties
      // we offer managed properties for an abstract getter method
      if (methodName.startsWith("get") && methodName.length() > 3 && Modifier.isPublic(modifiers) && Modifier.isAbstract(modifiers)) {
        String propertyName = methodName.substring(3, 4).toLowerCase() + methodName.substring(4);
        CompletionItem property = new CompletionItem(propertyName);
        if (isMethodDeprecated) {
          property.setTags(Arrays.asList(CompletionItemTag.Deprecated));
        }
        property.setKind(CompletionItemKind.Property);
        if (resultSet.add(propertyName)) {
          results.add(property);
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
      CompletionItem item = generateCompletionItemForMethod(method.name, Arrays.asList(method.parameterTypes), method.deprecated);
      if (resultSet.add(item.getLabel())) {
        results.add(item);
      }
    }
    for (GradleField field : closure.fields) {
      CompletionItem property = new CompletionItem(field.name);
      property.setKind(CompletionItemKind.Property);
      if (field.deprecated) {
        property.setTags(Arrays.asList(CompletionItemTag.Deprecated));
      }
      if (resultSet.add(field.name)) {
        results.add(property);
      }
    }
    return results;
  }

  private static CompletionItem generateCompletionItemForMethod(String name, List<String> arguments, boolean deprecated) {
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
    if (deprecated) {
      item.setTags(Arrays.asList(CompletionItemTag.Deprecated));
    }
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

  private static boolean isDeprecated(FieldOrMethod object) {
    for (Attribute attribute : object.getAttributes()) {
      if (attribute.toString().contains("Deprecated")) {
        return true;
      }
    }
    return false;
  }

  private static void setSortText(CompletionItem item) {
    // priority: function > property
    int kindValue = (item.getKind() == CompletionItemKind.Function) ? 0 : 1;
    StringBuilder builder = new StringBuilder();
    builder.append(String.valueOf(kindValue));
    builder.append(item.getLabel());
    item.setSortText(builder.toString());
  }
}
