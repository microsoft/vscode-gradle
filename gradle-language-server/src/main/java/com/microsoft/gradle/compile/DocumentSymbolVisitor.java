// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.compile;

import com.microsoft.gradle.utils.LSPUtils;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.codehaus.groovy.ast.ModuleNode;
import org.codehaus.groovy.ast.expr.ArgumentListExpression;
import org.codehaus.groovy.ast.expr.BinaryExpression;
import org.codehaus.groovy.ast.expr.ClosureExpression;
import org.codehaus.groovy.ast.expr.ConstantExpression;
import org.codehaus.groovy.ast.expr.Expression;
import org.codehaus.groovy.ast.expr.GStringExpression;
import org.codehaus.groovy.ast.expr.MapEntryExpression;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.codehaus.groovy.ast.expr.NamedArgumentListExpression;
import org.codehaus.groovy.ast.expr.PropertyExpression;
import org.codehaus.groovy.ast.expr.TupleExpression;
import org.codehaus.groovy.ast.expr.VariableExpression;
import org.codehaus.groovy.ast.stmt.BlockStatement;
import org.codehaus.groovy.ast.stmt.ExpressionStatement;
import org.codehaus.groovy.ast.stmt.Statement;
import org.codehaus.groovy.control.SourceUnit;
import org.eclipse.lsp4j.DocumentSymbol;
import org.eclipse.lsp4j.SymbolKind;

public class DocumentSymbolVisitor {

	private URI currentUri;
	private Map<URI, List<DocumentSymbol>> documentSymbols = new HashMap<>();
	private Map<URI, List<DocumentSymbol>> dependencies = new HashMap<>();

	public List<DocumentSymbol> getDocumentSymbols(URI uri) {
		return this.documentSymbols.get(uri);
	}

	public List<DocumentSymbol> getDependencies(URI uri) {
		return this.dependencies.get(uri);
	}

	public void visitCompilationUnit(URI uri, GradleCompilationUnit compilationUnit) {
		this.currentUri = uri;
		compilationUnit.iterator().forEachRemaining(unit -> visitSourceUnit(uri, unit));
	}

	public void visitSourceUnit(URI uri, SourceUnit unit) {
		ModuleNode moduleNode = unit.getAST();
		if (moduleNode != null) {
			this.documentSymbols.put(uri, new ArrayList<>());
			this.dependencies.put(uri, new ArrayList<>());
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
		String detail = getSymbolDetail(expression);
		if (detail != null) {
			symbol.setDetail(detail);
		}
		symbol.setSelectionRange(LSPUtils.toRange(expression));
		symbol.setRange(LSPUtils.toRange(expression));
		if (expression.getMethodAsString().equals("dependencies")) {
			List<DocumentSymbol> dependencySymbols = getDependencies(expression);
			symbol.setChildren(dependencySymbols);
			this.dependencies.get(currentUri).addAll(dependencySymbols);
		}
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
			builder.append(getSymbolName((PropertyExpression) objectExpression));
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
			builder.append(getSymbolName((PropertyExpression) objectExpression));
		} else if (objectExpression instanceof VariableExpression) {
			builder.append(objectExpression.getText());
		}
		if (property instanceof ConstantExpression) {
			builder.append(".");
			builder.append(property.getText());
		}
		return builder.toString();
	}

	private String getSymbolDetail(MethodCallExpression expression) {
		Expression argument = expression.getArguments();
		if (argument instanceof ArgumentListExpression) {
			List<Expression> arguments = ((ArgumentListExpression) argument).getExpressions();
			if (!arguments.isEmpty() && arguments.get(0) instanceof ConstantExpression) {
				// if first arg is constantExpression, show it as detail
				return arguments.get(0).getText();
			}
			return null;
		} else if (argument instanceof TupleExpression) {
			// if argument is tupleExpression, show first argument as detail
			List<Expression> arguments = ((TupleExpression) argument).getExpressions();
			if (!arguments.isEmpty() && arguments.get(0) instanceof NamedArgumentListExpression) {
				NamedArgumentListExpression namedArgumentListExpression = (NamedArgumentListExpression) arguments
						.get(0);
				List<MapEntryExpression> mapEntryExpressions = namedArgumentListExpression.getMapEntryExpressions();
				if (!mapEntryExpressions.isEmpty()) {
					MapEntryExpression firstExpression = mapEntryExpressions.get(0);
					if (firstExpression.getValueExpression() instanceof ConstantExpression) {
						StringBuilder detail = new StringBuilder();
						detail.append(firstExpression.getKeyExpression().getText());
						detail.append(": ");
						detail.append(firstExpression.getValueExpression().getText());
						return detail.toString();
					}
				}
				return null;
			}
		}
		return null;
	}

	private List<DocumentSymbol> getDependencies(MethodCallExpression expression) {
		Expression argument = expression.getArguments();
		if (expression.getMethodAsString().equals("dependencies")) {
			return getDependencies((ArgumentListExpression) argument);
		}
		List<DocumentSymbol> results = new ArrayList<>();
		DocumentSymbol symbol = new DocumentSymbol();
		String name = expression.getMethodAsString();
		symbol.setName(name);
		String detail = getDetail(expression);
		if (detail != null) {
			symbol.setDetail(detail);
		}
		symbol.setKind(SymbolKind.Constant);
		symbol.setRange(LSPUtils.toRange(expression));
		symbol.setSelectionRange(LSPUtils.toRange(expression));
		results.add(symbol);
		return results;
	}

	private List<DocumentSymbol> getDependencies(ArgumentListExpression argumentListExpression) {
		List<Expression> expressions = argumentListExpression.getExpressions();
		List<DocumentSymbol> symbols = new ArrayList<>();
		for (Expression expression : expressions) {
			if (expression instanceof ClosureExpression) {
				symbols.addAll(getDependencies((ClosureExpression) expression));
			} else if (expression instanceof MethodCallExpression) {
				symbols.addAll(getDependencies((MethodCallExpression) expression));
			}
		}
		return symbols;
	}

	private List<DocumentSymbol> getDependencies(ClosureExpression expression) {
		Statement code = expression.getCode();
		if (code instanceof BlockStatement) {
			return getDependencies((BlockStatement) code);
		}
		return Collections.emptyList();
	}

	private List<DocumentSymbol> getDependencies(BlockStatement blockStatement) {
		List<Statement> statements = blockStatement.getStatements();
		List<DocumentSymbol> symbols = new ArrayList<>();
		for (Statement statement : statements) {
			if (statement instanceof ExpressionStatement) {
				symbols.addAll(getDependencies((ExpressionStatement) statement));
			}
		}
		return symbols;
	}

	private List<DocumentSymbol> getDependencies(ExpressionStatement expressionStatement) {
		Expression expression = expressionStatement.getExpression();
		List<DocumentSymbol> symbols = new ArrayList<>();
		if (expression instanceof MethodCallExpression) {
			symbols.addAll(getDependencies((MethodCallExpression) expression));
		}
		return symbols;
	}

	private String getDetail(MethodCallExpression node) {
		Expression arguments = node.getArguments();
		if (arguments instanceof ArgumentListExpression) {
			List<Expression> expressions = ((ArgumentListExpression) arguments).getExpressions();
			for (Expression expression : expressions) {
				if (expression instanceof MethodCallExpression) {
					return getDetail((MethodCallExpression) expression);
				} else if (expression instanceof GStringExpression || expression instanceof ConstantExpression) {
					return expression.getText();
				}
			}
		}
		return null;
	}
}
