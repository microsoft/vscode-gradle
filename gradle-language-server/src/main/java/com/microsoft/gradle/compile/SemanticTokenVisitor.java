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

import com.microsoft.gradle.semantictokens.SemanticToken;
import com.microsoft.gradle.semantictokens.TokenModifier;
import com.microsoft.gradle.semantictokens.TokenType;
import com.microsoft.gradle.utils.LSPUtils;

import org.codehaus.groovy.ast.ASTNode;
import org.codehaus.groovy.ast.ClassCodeVisitorSupport;
import org.codehaus.groovy.ast.ModuleNode;
import org.codehaus.groovy.ast.expr.ArgumentListExpression;
import org.codehaus.groovy.ast.expr.BinaryExpression;
import org.codehaus.groovy.ast.expr.ConstantExpression;
import org.codehaus.groovy.ast.expr.Expression;
import org.codehaus.groovy.ast.expr.MapEntryExpression;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.codehaus.groovy.ast.expr.PropertyExpression;
import org.codehaus.groovy.ast.expr.VariableExpression;
import org.codehaus.groovy.ast.stmt.BlockStatement;
import org.codehaus.groovy.ast.stmt.ExpressionStatement;
import org.codehaus.groovy.ast.stmt.Statement;
import org.codehaus.groovy.control.SourceUnit;
import org.eclipse.lsp4j.DocumentSymbol;
import org.eclipse.lsp4j.SymbolKind;

public class SemanticTokenVisitor extends ClassCodeVisitorSupport {

  private URI currentUri;
  private Map<URI, List<SemanticToken>> tokens = new HashMap<>();
  private Map<URI, List<DocumentSymbol>> documentSymbols = new HashMap<>();

  public List<SemanticToken> getSemanticTokens(URI uri) {
    return this.tokens.get(uri);
  }

  public List<DocumentSymbol> getDocumentSymbols(URI uri) {
    return this.documentSymbols.get(uri);
  }

  private void addToken(int line, int column, int length, TokenType tokenType, int modifiers) {
    if (length > 0) {
      tokens.get(currentUri).add(new SemanticToken(line, column, length, tokenType, modifiers));
    }
  }

  private void addToken(ASTNode node, TokenType tokenType, int modifiers) {
    addToken(node.getLineNumber(), node.getColumnNumber(), node.getLength(), tokenType, modifiers);
  }

  private void addToken(ASTNode node, TokenType tokenType) {
    addToken(node.getLineNumber(), node.getColumnNumber(), node.getLength(), tokenType, 0);
  }

  public void visitCompilationUnit(URI uri, GradleCompilationUnit compilationUnit) {
    this.currentUri = uri;
    compilationUnit.iterator().forEachRemaining(unit -> visitSourceUnit(uri, unit));
  }

  public void visitSourceUnit(URI uri, SourceUnit unit) {
    ModuleNode moduleNode = unit.getAST();
    if (moduleNode != null) {
      this.tokens.put(uri, new ArrayList<>());
      this.documentSymbols.put(uri, new ArrayList<>());
      visitModule(moduleNode);
    }
  }

  public void visitModule(ModuleNode node) {
    node.getClasses().forEach(classNode -> {
      super.visitClass(classNode);
    });
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

  @Override
  public void visitMethodCallExpression(MethodCallExpression node) {
    if (TokenModifier.isDefaultLibrary(node.getMethod().getText())) {
      addToken(node.getMethod(), TokenType.FUNCTION, TokenModifier.DEFAULT_LIBRARY.bitmask);
    } else {
      addToken(node.getMethod(), TokenType.FUNCTION);
    }
    super.visitMethodCallExpression(node);
  }

  @Override
  public void visitMapEntryExpression(MapEntryExpression node) {
    addToken(node.getKeyExpression(), TokenType.PARAMETER);
    super.visitMapEntryExpression(node);
  }

  @Override
  public void visitVariableExpression(VariableExpression node) {
    addToken(node, TokenType.VARIABLE);
    super.visitVariableExpression(node);
  }

  @Override
  public void visitPropertyExpression(PropertyExpression node) {
    addToken(node.getProperty(), TokenType.PROPERTY);
    super.visitPropertyExpression(node);
  }
}
