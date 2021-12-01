// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.compile;

import com.microsoft.gradle.semantictokens.SemanticToken;
import com.microsoft.gradle.semantictokens.TokenModifier;
import com.microsoft.gradle.semantictokens.TokenType;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.codehaus.groovy.ast.ASTNode;
import org.codehaus.groovy.ast.ClassCodeVisitorSupport;
import org.codehaus.groovy.ast.ModuleNode;
import org.codehaus.groovy.ast.expr.MapEntryExpression;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.codehaus.groovy.ast.expr.PropertyExpression;
import org.codehaus.groovy.ast.expr.VariableExpression;
import org.codehaus.groovy.control.SourceUnit;

public class SemanticTokenVisitor extends ClassCodeVisitorSupport {

	private URI currentUri;
	private Map<URI, List<SemanticToken>> tokens = new HashMap<>();

	public List<SemanticToken> getSemanticTokens(URI uri) {
		return this.tokens.get(uri);
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
