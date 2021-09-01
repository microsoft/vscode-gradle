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
import org.codehaus.groovy.ast.expr.BinaryExpression;
import org.codehaus.groovy.ast.expr.ConstantExpression;
import org.codehaus.groovy.ast.expr.Expression;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.codehaus.groovy.ast.expr.PropertyExpression;
import org.codehaus.groovy.ast.expr.VariableExpression;
import org.codehaus.groovy.ast.stmt.BlockStatement;
import org.codehaus.groovy.ast.stmt.ExpressionStatement;
import org.codehaus.groovy.ast.stmt.Statement;
import org.codehaus.groovy.control.SourceUnit;
import org.eclipse.lsp4j.DocumentSymbol;
import org.eclipse.lsp4j.SymbolKind;

public class DocumentSymbolVisitor extends ClassCodeVisitorSupport {

  private URI currentUri;
  private Map<URI, List<DocumentSymbol>> documentSymbols = new HashMap<>();

  public List<DocumentSymbol> getDocumentSymbols(URI uri) {
    return this.documentSymbols.get(uri);
  }

  public void visitCompilationUnit(URI uri, GradleCompilationUnit compilationUnit) {
    this.currentUri = uri;
    compilationUnit.iterator().forEachRemaining(unit -> visitSourceUnit(uri, unit));
  }

  public void visitSourceUnit(URI uri, SourceUnit unit) {
    ModuleNode moduleNode = unit.getAST();
    if (moduleNode != null) {
      this.documentSymbols.put(uri, new ArrayList<>());
      visitModule(moduleNode);
    }
  }

  public void visitModule(ModuleNode node) {
    BlockStatement blockStatement = node.getStatementBlock();
    List<Statement> statements = blockStatement.getStatements();
    for (Statement statement : statements) {
      if (statement instanceof ExpressionStatement) {
        DocumentSymbol symbol = getDocumentSymbol((ExpressionStatement) statement);
        if (symbol != null) {
          this.documentSymbols.get(this.currentUri).add(symbol);
        }
      }
    }
  }

  public DocumentSymbol getDocumentSymbol(ExpressionStatement statement) {
    Expression expression = statement.getExpression();
    DocumentSymbol symbol = null;
    if (expression instanceof MethodCallExpression) {
      symbol = getDocumentSymbol((MethodCallExpression) expression);
    } else if (expression instanceof BinaryExpression) {
      symbol = getDocumentSymbol((BinaryExpression) expression);
    }
    if (symbol == null || symbol.getName() == null) {
      return null;
    }
    return symbol;
  }

  private DocumentSymbol getDocumentSymbol(BinaryExpression expression) {
    Expression left = expression.getLeftExpression();
    Expression right = expression.getRightExpression();
    DocumentSymbol symbol = new DocumentSymbol();
    symbol.setName(left.getText());
    if (right instanceof ConstantExpression) {
      symbol.setDetail(right.getText());
    }
    symbol.setKind(SymbolKind.Property);
    symbol.setRange(LSPUtils.toRange(expression));
    symbol.setSelectionRange(LSPUtils.toRange(expression));
    return symbol;
  }

  private DocumentSymbol getDocumentSymbol(MethodCallExpression expression) {
    DocumentSymbol symbol = new DocumentSymbol();
    symbol.setKind(SymbolKind.Function);
    String name = getSymbolName(expression);
    if (name == null) {
      return null;
    }
    symbol.setName(name);
    symbol.setSelectionRange(LSPUtils.toRange(expression));
    symbol.setRange(LSPUtils.toRange(expression));
    return symbol;
  }

  private String getSymbolName(MethodCallExpression expression) {
    Expression objectExpression = expression.getObjectExpression();
    if (objectExpression instanceof VariableExpression) {
      StringBuilder builder = new StringBuilder();
      String objectText = objectExpression.getText();
      if (!objectText.equals("this")) {
        // variable "this" should be ignored
        builder.append(objectText);
        builder.append(".");
      }
      builder.append(expression.getMethodAsString());
      Expression arguments = expression.getArguments();
      if (arguments instanceof ArgumentListExpression) {
        List<Expression> expressions = ((ArgumentListExpression) arguments).getExpressions();
        for (Expression exp : expressions) {
          if (exp instanceof MethodCallExpression) {
            // for case: task taskName(Closure), we show "task taskName" in outline
            builder.append(" ");
            builder.append(getSymbolName((MethodCallExpression) exp));
          }
        }
      }
      return builder.toString();
    } else if (objectExpression instanceof PropertyExpression) {
      // for case: a.b.c.d("string"), we show "a.b.c.d" in outline
      StringBuilder builder = new StringBuilder();
      builder.append(getSymbolName((PropertyExpression)objectExpression));
      builder.append(".");
      builder.append(expression.getMethodAsString());
      return builder.toString();
    }
    return null;
  }

  private String getSymbolName(PropertyExpression expression) {
    Expression objectExpression = expression.getObjectExpression();
    Expression property = expression.getProperty();
    StringBuilder builder = new StringBuilder();
    if (objectExpression instanceof PropertyExpression) {
      builder.append(getSymbolName((PropertyExpression)objectExpression));
    } else if (objectExpression instanceof VariableExpression) {
      builder.append(objectExpression.getText());
    }
    if (property instanceof ConstantExpression) {
      builder.append(".");
      builder.append(property.getText());
    }
    return builder.toString();
  }
}
