// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.google.common.base.Charsets;
import com.google.common.io.Files;
import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.microsoft.gradle.compile.CompletionVisitor;
import com.microsoft.gradle.compile.CompletionVisitor.DependencyItem;
import com.microsoft.gradle.compile.DocumentSymbolVisitor;
import com.microsoft.gradle.compile.GradleCompilationUnit;
import com.microsoft.gradle.compile.SemanticTokenVisitor;
import com.microsoft.gradle.handlers.CompletionHandler;
import com.microsoft.gradle.handlers.DefaultDependenciesHandler;
import com.microsoft.gradle.handlers.DefaultDependenciesHandler.DefaultDependencyItem;
import com.microsoft.gradle.handlers.MavenCentralCompletionHandler;
import com.microsoft.gradle.handlers.MavenIndexCompletionHandler;
import com.microsoft.gradle.handlers.MavenLocalCompletionHandler;
import com.microsoft.gradle.manager.GradleFilesManager;
import com.microsoft.gradle.resolver.GradleClosure;
import com.microsoft.gradle.resolver.GradleLibraryResolver;
import com.microsoft.gradle.semantictokens.SemanticToken;
import com.microsoft.gradle.utils.LSPUtils;
import com.microsoft.gradle.utils.Utils;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;
import org.codehaus.groovy.ast.expr.Expression;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.codehaus.groovy.ast.stmt.Statement;
import org.codehaus.groovy.control.CompilationFailedException;
import org.codehaus.groovy.control.ErrorCollector;
import org.codehaus.groovy.control.Phases;
import org.codehaus.groovy.control.messages.Message;
import org.codehaus.groovy.control.messages.SyntaxErrorMessage;
import org.codehaus.groovy.syntax.SyntaxException;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionList;
import org.eclipse.lsp4j.CompletionParams;
import org.eclipse.lsp4j.Diagnostic;
import org.eclipse.lsp4j.DiagnosticSeverity;
import org.eclipse.lsp4j.DidChangeConfigurationParams;
import org.eclipse.lsp4j.DidChangeTextDocumentParams;
import org.eclipse.lsp4j.DidChangeWatchedFilesParams;
import org.eclipse.lsp4j.DidCloseTextDocumentParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.DidSaveTextDocumentParams;
import org.eclipse.lsp4j.DocumentSymbol;
import org.eclipse.lsp4j.DocumentSymbolParams;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.SemanticTokens;
import org.eclipse.lsp4j.SemanticTokensParams;
import org.eclipse.lsp4j.SymbolInformation;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextDocumentItem;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.lsp4j.services.LanguageClient;
import org.eclipse.lsp4j.services.LanguageClientAware;
import org.eclipse.lsp4j.services.TextDocumentService;
import org.eclipse.lsp4j.services.WorkspaceService;
import org.eclipse.lsp4j.util.Ranges;

public class GradleServices implements TextDocumentService, WorkspaceService, LanguageClientAware {

	public static final List<String> supportedCommands = Arrays.asList("gradle.getDependencies",
			"gradle.distributionChanged", "gradle.setPlugins", "gradle.setClosures", "gradle.setScriptClasspaths");

	private LanguageClient client;
	private GradleFilesManager gradleFilesManager;
	private SemanticTokenVisitor semanticTokenVisitor;
	private DocumentSymbolVisitor documentSymbolVisitor;
	private CompletionVisitor completionVisitor;
	private GradleLibraryResolver libraryResolver;
	private DefaultDependenciesHandler defaultDependenciesHandler;
	private MavenCentralCompletionHandler mavenCentralCompletionHandler;
	private MavenLocalCompletionHandler mavenLocalCompletionHandler;
	private MavenIndexCompletionHandler mavenIndexCompletionHandler;

	public GradleServices() {
		this.gradleFilesManager = new GradleFilesManager();
		this.semanticTokenVisitor = new SemanticTokenVisitor();
		this.documentSymbolVisitor = new DocumentSymbolVisitor();
		this.completionVisitor = new CompletionVisitor();
		this.libraryResolver = new GradleLibraryResolver(this.gradleFilesManager);
		this.defaultDependenciesHandler = new DefaultDependenciesHandler();
		this.mavenCentralCompletionHandler = new MavenCentralCompletionHandler();
		this.mavenLocalCompletionHandler = new MavenLocalCompletionHandler();
		this.mavenIndexCompletionHandler = new MavenIndexCompletionHandler();
	}

	public GradleLibraryResolver getLibraryResolver() {
		return this.libraryResolver;
	}

	@Override
	public void connect(LanguageClient client) {
		this.client = client;
	}

	@Override
	public void didOpen(DidOpenTextDocumentParams params) {
		URI uri = URI.create(params.getTextDocument().getUri());
		gradleFilesManager.didOpen(uri, params.getTextDocument().getText());
		GradleCompilationUnit unit = this.gradleFilesManager.getCompilationUnit(uri,
				params.getTextDocument().getVersion(), /** forceRecompile */
				false);
		compile(uri, unit);
	}

	@Override
	public void didChange(DidChangeTextDocumentParams params) {
		URI uri = URI.create(params.getTextDocument().getUri());
		for (TextDocumentContentChangeEvent change : params.getContentChanges()) {
			gradleFilesManager.didChange(uri, change);
		}
		GradleCompilationUnit unit = this.gradleFilesManager.getCompilationUnit(uri,
				params.getTextDocument().getVersion(), /** forceRecompile */
				false);
		compile(uri, unit);
	}

	@Override
	public void didClose(DidCloseTextDocumentParams params) {
		URI uri = URI.create(params.getTextDocument().getUri());
		gradleFilesManager.didClose(uri);
	}

	@Override
	public void didSave(DidSaveTextDocumentParams params) {
		// TODO
	}

	@Override
	public void didChangeWatchedFiles(DidChangeWatchedFilesParams params) {
		// TODO
	}

	@Override
	public void didChangeConfiguration(DidChangeConfigurationParams params) {
		Map<?, ?> settings = new Gson().fromJson((JsonElement) params.getSettings(), Map.class);
		this.applySetting(settings);
	}

	public void applySetting(Object settings) {
		if (settings instanceof Map) {
			this.getLibraryResolver().setGradleHome((String) ((Map<?, ?>) settings).get("gradleHome"));
			this.getLibraryResolver().setGradleVersion((String) ((Map<?, ?>) settings).get("gradleVersion"));
			this.getLibraryResolver()
					.setGradleWrapperEnabled((Boolean) ((Map<?, ?>) settings).get("gradleWrapperEnabled"));
			this.getLibraryResolver().setGradleUserHomePath((String) ((Map<?, ?>) settings).get("gradleUserHome"));
			this.getLibraryResolver().resolveGradleAPI();
		}
	}

	private void compile(URI uri, GradleCompilationUnit unit) {
		if (unit == null) {
			return;
		}
		Set<PublishDiagnosticsParams> diagnostics = new HashSet<>();
		try {
			unit.compile(Phases.CANONICALIZATION);
			// Send empty diagnostic if there is no error
			diagnostics.add(new PublishDiagnosticsParams(uri.toString(), Collections.emptyList()));
		} catch (CompilationFailedException e) {
			diagnostics = generateDiagnostics(unit.getErrorCollector());
		}
		for (PublishDiagnosticsParams diagnostic : diagnostics) {
			client.publishDiagnostics(diagnostic);
		}
	}

	private void recompileAll() {
		for (Map.Entry<URI, GradleCompilationUnit> entry : this.gradleFilesManager.getUnitStorage().entrySet()) {
			URI uri = entry.getKey();
			GradleCompilationUnit unit = this.gradleFilesManager.getCompilationUnit(uri,
					entry.getValue().getVersion(), /** forceRecompile */
					true);
			compile(uri, unit);
		}
	}

	private Set<PublishDiagnosticsParams> generateDiagnostics(ErrorCollector collector) {
		// URI, List<Diagnostic>
		Map<String, List<Diagnostic>> diagnosticsStorage = new HashMap<>();
		for (Message error : collector.getErrors()) {
			if (error instanceof SyntaxErrorMessage) {
				SyntaxException exp = ((SyntaxErrorMessage) error).getCause();
				Range range = LSPUtils.toRange(exp);
				Diagnostic diagnostic = new Diagnostic();
				diagnostic.setRange(range);
				diagnostic.setSeverity(DiagnosticSeverity.Error);
				diagnostic.setMessage(exp.getMessage());
				diagnostic.setSource("Gradle");
				if (diagnosticsStorage.containsKey(exp.getSourceLocator())) {
					diagnosticsStorage.get(exp.getSourceLocator()).add(diagnostic);
				} else {
					List<Diagnostic> diagnostics = new ArrayList<>();
					diagnostics.add(diagnostic);
					diagnosticsStorage.put(exp.getSourceLocator(), diagnostics);
				}
			}
		}
		Set<PublishDiagnosticsParams> diagnosticsParams = new HashSet<>();
		for (Map.Entry<String, List<Diagnostic>> entry : diagnosticsStorage.entrySet()) {
			diagnosticsParams.add(new PublishDiagnosticsParams(entry.getKey(), entry.getValue()));
		}
		return diagnosticsParams;
	}

	@Override
	public CompletableFuture<SemanticTokens> semanticTokensFull(SemanticTokensParams params) {
		URI uri = URI.create(params.getTextDocument().getUri());
		GradleCompilationUnit unit = this.gradleFilesManager.getCompilationUnit(uri);
		if (unit == null) {
			return CompletableFuture.completedFuture(new SemanticTokens(Collections.emptyList()));
		}
		this.semanticTokenVisitor.visitCompilationUnit(uri, unit);
		List<SemanticToken> semanticTokens = this.semanticTokenVisitor.getSemanticTokens(uri);
		if (semanticTokens == null) {
			return CompletableFuture.completedFuture(new SemanticTokens(Collections.emptyList()));
		}
		return CompletableFuture.completedFuture(new SemanticTokens(SemanticToken.encodedTokens(semanticTokens)));
	}

	@Override
	public CompletableFuture<List<Either<SymbolInformation, DocumentSymbol>>> documentSymbol(
			DocumentSymbolParams params) {
		URI uri = URI.create(params.getTextDocument().getUri());
		GradleCompilationUnit unit = this.gradleFilesManager.getCompilationUnit(uri);
		if (unit == null) {
			return CompletableFuture.completedFuture(Collections.emptyList());
		}
		this.documentSymbolVisitor.visitCompilationUnit(uri, unit);
		List<DocumentSymbol> documentSymbols = this.documentSymbolVisitor.getDocumentSymbols(uri);
		if (documentSymbols == null) {
			return CompletableFuture.completedFuture(Collections.emptyList());
		}
		List<Either<SymbolInformation, DocumentSymbol>> result = new ArrayList<>();
		for (DocumentSymbol symbol : documentSymbols) {
			result.add(Either.forRight(symbol));
		}
		return CompletableFuture.completedFuture(result);
	}

	@Override
	public CompletableFuture<Either<List<CompletionItem>, CompletionList>> completion(CompletionParams params) {
		URI uri = URI.create(params.getTextDocument().getUri());
		GradleCompilationUnit unit = this.gradleFilesManager.getCompilationUnit(uri);
		if (unit == null) {
			return CompletableFuture.completedFuture(Either.forLeft(Collections.emptyList()));
		}
		this.completionVisitor.visitCompilationUnit(uri, unit);
		List<DependencyItem> dependencies = this.completionVisitor.getDependencies(uri);
		if (dependencies == null) {
			return CompletableFuture.completedFuture(Either.forLeft(Collections.emptyList()));
		}
		for (DependencyItem dependency : dependencies) {
			if (Ranges.containsPosition(dependency.getRange(), params.getPosition())) {
				List<CompletionItem> results = new ArrayList<>();
				// Add Maven Index results
				results.addAll(this.mavenIndexCompletionHandler.getDependencyCompletionItems(dependency,
						params.getPosition()));
				// Add Maven Local Results
				results.addAll(this.mavenLocalCompletionHandler.getDependencyCompletionItems(dependency,
						params.getPosition()));
				// Add Maven Central Results
				results.addAll(this.mavenCentralCompletionHandler.getDependencyCompletionItems(dependency,
						params.getPosition()));
				// remove duplicate results
				results = results.stream().filter(Utils.distinctByKey(CompletionItem::getLabel))
						.collect(Collectors.toList());
				return CompletableFuture.completedFuture(Either.forLeft(results));
			}
		}
		// should return empty if in constants
		List<Expression> constants = this.completionVisitor.getConstants(uri);
		for (Expression constant : constants) {
			Range range = LSPUtils.toRange(constant);
			if (Ranges.containsPosition(range, params.getPosition())) {
				return CompletableFuture.completedFuture(Either.forLeft(Collections.emptyList()));
			}
		}
		Set<MethodCallExpression> methodCalls = this.completionVisitor.getMethodCalls(uri);
		MethodCallExpression containingCall = null;
		for (MethodCallExpression call : methodCalls) {
			Expression expression = call.getArguments();
			Range range = LSPUtils.toRange(expression);
			if (Ranges.containsPosition(range, params.getPosition())
					&& (containingCall == null || Ranges.containsRange(LSPUtils.toRange(containingCall.getArguments()),
							LSPUtils.toRange(call.getArguments())))) {
				// find inner containing call
				containingCall = call;
			}
		}
		this.libraryResolver.loadGradleClasses(uri);
		boolean javaPluginsIncluded = this.libraryResolver.isJavaPluginsIncluded(uri,
				this.completionVisitor.getPlugins(uri));
		CompletionHandler handler = new CompletionHandler();
		// check again
		String projectPath = Utils.getFolderPath(uri);
		if (containingCall == null && isGradleRoot(uri, params.getPosition())) {
			return CompletableFuture.completedFuture(Either.forLeft(handler.getCompletionItems(null,
					Paths.get(uri).getFileName().toString(), this.libraryResolver, javaPluginsIncluded, projectPath)));
		}
		return CompletableFuture.completedFuture(Either.forLeft(handler.getCompletionItems(containingCall,
				Paths.get(uri).getFileName().toString(), this.libraryResolver, javaPluginsIncluded, projectPath)));
	}

	@Override
	public CompletableFuture<Object> executeCommand(ExecuteCommandParams params) {
		String command = params.getCommand();
		List<Object> arguments = params.getArguments();
		if (command.equals("gradle.getDependencies")) {
			if (arguments.isEmpty()) {
				return CompletableFuture.completedFuture(null);
			}
			String uriString = new Gson().fromJson((JsonElement) arguments.get(0), String.class);
			URI uri = URI.create(uriString);
			if (this.gradleFilesManager.getCompilationUnit(uri) == null) {
				try {
					Path uriPath = Paths.get(uri);
					String content = Files.asCharSource(uriPath.toFile(), Charsets.UTF_8).read();
					DidOpenTextDocumentParams openDocumentParams = new DidOpenTextDocumentParams(
							new TextDocumentItem(uriString, "gradle", 1, content));
					this.didOpen(openDocumentParams);
					DocumentSymbolParams documentSymbolParams = new DocumentSymbolParams(
							new TextDocumentIdentifier(uriString));
					this.documentSymbol(documentSymbolParams);
				} catch (IOException e) {
					return CompletableFuture.completedFuture(null);
				}
			}
			List<DocumentSymbol> dependencies = this.documentSymbolVisitor.getDependencies(uri);
			if (dependencies == null) {
				return CompletableFuture.completedFuture(null);
			}
			List<DefaultDependencyItem> result = defaultDependenciesHandler.getDefaultDependencies(dependencies);
			return CompletableFuture.completedFuture(result);
		} else if (command.equals("gradle.distributionChanged")) {
			this.libraryResolver.resolveGradleAPI();
		} else if (command.equals("gradle.setPlugins")) {
			if (arguments.isEmpty()) {
				return CompletableFuture.completedFuture(null);
			}
			String projectPath = new Gson().fromJson((JsonElement) arguments.get(0), String.class);
			String[] plugins = new Gson().fromJson((JsonElement) arguments.get(1), String[].class);
			this.libraryResolver.setProjectPlugins(projectPath, Arrays.asList(plugins));
		} else if (command.equals("gradle.setClosures")) {
			if (arguments.isEmpty()) {
				return CompletableFuture.completedFuture(null);
			}
			String projectPath = new Gson().fromJson((JsonElement) arguments.get(0), String.class);
			GradleClosure[] closures = new Gson().fromJson((JsonElement) arguments.get(1), GradleClosure[].class);
			this.libraryResolver.setExtClosures(projectPath, Arrays.asList(closures));
		} else if (command.equals("gradle.setScriptClasspaths")) {
			if (arguments.isEmpty()) {
				return CompletableFuture.completedFuture(null);
			}
			String projectPath = new Gson().fromJson((JsonElement) arguments.get(0), String.class);
			String[] scriptClasspaths = new Gson().fromJson((JsonElement) arguments.get(1), String[].class);
			this.gradleFilesManager.setScriptClasspaths(projectPath, Arrays.asList(scriptClasspaths));
			this.recompileAll();
		}
		return CompletableFuture.completedFuture(null);
	}

	private boolean isGradleRoot(URI uri, Position position) {
		List<Statement> statements = this.completionVisitor.getStatements(uri);
		for (Statement statement : statements) {
			Range range = LSPUtils.toRange(statement);
			if (Ranges.containsPosition(range, position)) {
				return false;
			}
		}
		return true;
	}
}
