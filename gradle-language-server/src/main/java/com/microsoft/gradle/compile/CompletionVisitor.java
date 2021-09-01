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
package com.microsoft.gradle.compile;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.microsoft.gradle.utils.LSPUtils;

import org.codehaus.groovy.ast.ClassCodeVisitorSupport;
import org.codehaus.groovy.ast.ModuleNode;
import org.codehaus.groovy.ast.expr.ArgumentListExpression;
import org.codehaus.groovy.ast.expr.ClosureExpression;
import org.codehaus.groovy.ast.expr.ConstantExpression;
import org.codehaus.groovy.ast.expr.Expression;
import org.codehaus.groovy.ast.expr.GStringExpression;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.codehaus.groovy.ast.stmt.BlockStatement;
import org.codehaus.groovy.ast.stmt.ExpressionStatement;
import org.codehaus.groovy.ast.stmt.Statement;
import org.codehaus.groovy.control.SourceUnit;
import org.eclipse.lsp4j.Range;

public class CompletionVisitor extends ClassCodeVisitorSupport {

  public class DependencyItem {
    private String text;
    private Range range;

    public DependencyItem(String text, Range range) {
      this.text = text;
      this.range = range;
    }

    public String getText() {
      return this.text;
    }

    public Range getRange() {
      return this.range;
    }
  }

  private URI currentUri;
  private Map<URI, List<DependencyItem>> dependencies = new HashMap<>();

  public List<DependencyItem> getDependencies(URI uri) {
    return this.dependencies.get(uri);
  }

  public void visitCompilationUnit(URI uri, GradleCompilationUnit compilationUnit) {
    this.currentUri = uri;
    compilationUnit.iterator().forEachRemaining(unit -> visitSourceUnit(uri, unit));
  }

  public void visitSourceUnit(URI uri, SourceUnit unit) {
    ModuleNode moduleNode = unit.getAST();
    if (moduleNode != null) {
      this.dependencies.put(uri, new ArrayList<>());
      visitModule(moduleNode);
    }
  }

  public void visitModule(ModuleNode node) {
    node.getClasses().forEach(classNode -> {
      super.visitClass(classNode);
    });
  }

  @Override
  public void visitMethodCallExpression(MethodCallExpression node) {
    if (node.getMethodAsString().equals("dependencies")) {
      this.dependencies.put(currentUri, getDependencies(node));
    }
    super.visitMethodCallExpression(node);
  }

  private List<DependencyItem> getDependencies(MethodCallExpression expression) {
    Expression argument = expression.getArguments();
    if (argument instanceof ArgumentListExpression) {
      return getDependencies((ArgumentListExpression) argument);
    }
    return new ArrayList<>();
  }

  private List<DependencyItem> getDependencies(ArgumentListExpression argumentListExpression) {
    List<Expression> expressions = argumentListExpression.getExpressions();
    List<DependencyItem> symbols = new ArrayList<>();
    for (Expression expression : expressions) {
      if (expression instanceof ClosureExpression) {
        symbols.addAll(getDependencies((ClosureExpression) expression));
      } else if (expression instanceof GStringExpression || expression instanceof ConstantExpression) {
        // GStringExp: implementation "org.gradle:gradle-tooling-api:${gradleToolingApi}"
        // ConstantExp: implementation "org.gradle:gradle-tooling-api:6.8.0"
        symbols.add(new DependencyItem(expression.getText(), LSPUtils.toDependencyRange(expression)));
      } else if (expression instanceof MethodCallExpression) {
        symbols.addAll(getDependencies((MethodCallExpression) expression));
      }
    }
    return symbols;
  }

  private List<DependencyItem> getDependencies(ClosureExpression expression) {
    Statement code = expression.getCode();
    if (code instanceof BlockStatement) {
      return getDependencies((BlockStatement) code);
    }
    return new ArrayList<>();
  }

  private List<DependencyItem> getDependencies(BlockStatement blockStatement) {
    List<Statement> statements = blockStatement.getStatements();
    List<DependencyItem> results = new ArrayList<>();
    for (Statement statement : statements) {
      if (statement instanceof ExpressionStatement) {
        results.addAll(getDependencies((ExpressionStatement) statement));
      }
    }
    return results;
  }

  private List<DependencyItem> getDependencies(ExpressionStatement expressionStatement) {
    Expression expression = expressionStatement.getExpression();
    if (expression instanceof MethodCallExpression) {
      return getDependencies((MethodCallExpression) expression);
    }
    return new ArrayList<>();
  }
}
