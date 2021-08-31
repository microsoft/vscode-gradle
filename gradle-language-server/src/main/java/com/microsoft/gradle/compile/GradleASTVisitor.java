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

import java.util.ArrayList;
import java.util.List;

import com.microsoft.gradle.semantictokens.SemanticToken;
import com.microsoft.gradle.semantictokens.TokenModifier;
import com.microsoft.gradle.semantictokens.TokenType;

import org.codehaus.groovy.ast.ASTNode;
import org.codehaus.groovy.ast.ClassCodeVisitorSupport;
import org.codehaus.groovy.ast.ModuleNode;
import org.codehaus.groovy.ast.expr.MapEntryExpression;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.codehaus.groovy.ast.expr.PropertyExpression;
import org.codehaus.groovy.ast.expr.VariableExpression;
import org.codehaus.groovy.control.SourceUnit;

public class GradleASTVisitor extends ClassCodeVisitorSupport {

  public GradleASTVisitor(GradleCompilationUnit unit) {
    this.compilationUnit = unit;
  }

  private GradleCompilationUnit compilationUnit;
  private List<SemanticToken> tokens = new ArrayList<>();

  public List<SemanticToken> getSemanticTokens() {
    return this.tokens;
  }

  private void addToken(int line, int column, int length, TokenType tokenType, int modifiers) {
    if (length > 0) {
      tokens.add(new SemanticToken(line, column, length, tokenType, modifiers));
    }
  }

  private void addToken(ASTNode node, TokenType tokenType, int modifiers) {
    addToken(node.getLineNumber(), node.getColumnNumber(), node.getLength(), tokenType, modifiers);
  }

  private void addToken(ASTNode node, TokenType tokenType) {
    addToken(node.getLineNumber(), node.getColumnNumber(), node.getLength(), tokenType, 0);
  }

  public void visitCompilationUnit() {
    this.compilationUnit.iterator().forEachRemaining(unit -> visitSourceUnit(unit));
  }

  public void visitSourceUnit(SourceUnit unit) {
    ModuleNode moduleNode = unit.getAST();
    if (moduleNode != null) {
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
