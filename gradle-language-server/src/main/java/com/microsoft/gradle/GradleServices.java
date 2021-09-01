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

package com.microsoft.gradle;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import com.microsoft.gradle.compile.SemanticTokenVisitor;
import com.microsoft.gradle.compile.GradleCompilationUnit;
import com.microsoft.gradle.manager.GradleFilesManager;
import com.microsoft.gradle.semantictokens.SemanticToken;
import com.microsoft.gradle.utils.LSPUtils;

import org.codehaus.groovy.control.CompilationFailedException;
import org.codehaus.groovy.control.ErrorCollector;
import org.codehaus.groovy.control.Phases;
import org.codehaus.groovy.control.messages.Message;
import org.codehaus.groovy.control.messages.SyntaxErrorMessage;
import org.codehaus.groovy.syntax.SyntaxException;
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
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.SemanticTokens;
import org.eclipse.lsp4j.SemanticTokensParams;
import org.eclipse.lsp4j.SymbolInformation;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.lsp4j.services.LanguageClient;
import org.eclipse.lsp4j.services.LanguageClientAware;
import org.eclipse.lsp4j.services.TextDocumentService;
import org.eclipse.lsp4j.services.WorkspaceService;

public class GradleServices implements TextDocumentService, WorkspaceService, LanguageClientAware {

  private LanguageClient client;
  private GradleFilesManager gradleFilesManager;
  private SemanticTokenVisitor semanticTokenVisitor;

  public GradleServices() {
    this.gradleFilesManager = new GradleFilesManager();
    this.semanticTokenVisitor = new SemanticTokenVisitor();
  }

  @Override
  public void connect(LanguageClient client) {
    this.client = client;
  }

  @Override
  public void didOpen(DidOpenTextDocumentParams params) {
    URI uri = URI.create(params.getTextDocument().getUri());
    gradleFilesManager.didOpen(uri, params.getTextDocument().getText());
    GradleCompilationUnit unit = this.gradleFilesManager.getCompilationUnit(uri, params.getTextDocument().getVersion());
    compile(uri, unit);
  }

  @Override
  public void didChange(DidChangeTextDocumentParams params) {
    URI uri = URI.create(params.getTextDocument().getUri());
    gradleFilesManager.didChange(uri, params.getContentChanges().get(0));
    GradleCompilationUnit unit = this.gradleFilesManager.getCompilationUnit(uri, params.getTextDocument().getVersion());
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
    // TODO
  }

  private void compile(URI uri, GradleCompilationUnit unit) {
    if (unit == null) {
      return;
    }
    Set<PublishDiagnosticsParams> diagnostics = new HashSet<>();
    try {
      unit.compile(Phases.CANONICALIZATION);
      // Send empty diagnostic if there is no error
      diagnostics.add(new PublishDiagnosticsParams(uri.toString(), new ArrayList<>()));
    } catch (CompilationFailedException e) {
      diagnostics = generateDiagnostics(unit.getErrorCollector());
    }
    for (PublishDiagnosticsParams diagnostic : diagnostics) {
      client.publishDiagnostics(diagnostic);
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
      return CompletableFuture.completedFuture(new SemanticTokens(new ArrayList<>()));
    }
    this.semanticTokenVisitor.visitCompilationUnit(uri, unit);
    return CompletableFuture
        .completedFuture(new SemanticTokens(SemanticToken.encodedTokens(this.semanticTokenVisitor.getSemanticTokens(uri))));
  }

  @Override
  public CompletableFuture<List<Either<SymbolInformation, DocumentSymbol>>> documentSymbol(
      DocumentSymbolParams params) {
    URI uri = URI.create(params.getTextDocument().getUri());
    List<Either<SymbolInformation, DocumentSymbol>> result = new ArrayList<>();
    for (DocumentSymbol symbol : this.visitor.getDocumentSymbols(uri)) {
      result.add(Either.forRight(symbol));
    }
    return CompletableFuture.completedFuture(result);
  }
}
