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

import java.io.IOException;
import java.net.Socket;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import com.microsoft.gradle.semantictokens.TokenModifier;
import com.microsoft.gradle.semantictokens.TokenType;

import org.eclipse.lsp4j.DocumentFilter;
import org.eclipse.lsp4j.InitializeParams;
import org.eclipse.lsp4j.InitializeResult;
import org.eclipse.lsp4j.SaveOptions;
import org.eclipse.lsp4j.SemanticTokensLegend;
import org.eclipse.lsp4j.SemanticTokensServerFull;
import org.eclipse.lsp4j.SemanticTokensWithRegistrationOptions;
import org.eclipse.lsp4j.ServerCapabilities;
import org.eclipse.lsp4j.TextDocumentSyncKind;
import org.eclipse.lsp4j.TextDocumentSyncOptions;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.eclipse.lsp4j.services.LanguageClient;
import org.eclipse.lsp4j.services.LanguageClientAware;
import org.eclipse.lsp4j.services.LanguageServer;
import org.eclipse.lsp4j.services.TextDocumentService;
import org.eclipse.lsp4j.services.WorkspaceService;

public class GradleLanguageServer implements LanguageServer, LanguageClientAware {

  private GradleServices gradleServices;

  public static void main(String[] args) {
    GradleLanguageServer server = new GradleLanguageServer();
    try {
      Launcher<LanguageClient> launcher;
      String port = System.getenv("VSCODE_GRADLE_PORT");
      if (port == null) {
        // Launch Mode
        launcher = Launcher.createLauncher(server, LanguageClient.class, System.in, System.out);
      } else {
        // Debug Mode
        Socket socket = new Socket("localhost", Integer.parseInt(port));
        launcher = Launcher.createLauncher(server, LanguageClient.class, socket.getInputStream(),
            socket.getOutputStream());
      }
      server.connect(launcher.getRemoteProxy());
      launcher.startListening();
    } catch (IOException e) {
      server.exit();
    }

  }

  public GradleLanguageServer() {
    this.gradleServices = new GradleServices();
  }

  @Override
  public CompletableFuture<InitializeResult> initialize(InitializeParams params) {
    ServerCapabilities serverCapabilities = new ServerCapabilities();
    SemanticTokensWithRegistrationOptions semanticOptions = new SemanticTokensWithRegistrationOptions();
    semanticOptions.setFull(new SemanticTokensServerFull(false));
    semanticOptions.setRange(false);
    semanticOptions.setDocumentSelector(List.of(new DocumentFilter("gradle", "file", null)));
    semanticOptions.setLegend(new SemanticTokensLegend(
        Arrays.stream(TokenType.values()).map(TokenType::toString).collect(Collectors.toList()),
        Arrays.stream(TokenModifier.values()).map(TokenModifier::toString).collect(Collectors.toList())));
    serverCapabilities.setSemanticTokensProvider(semanticOptions);
    serverCapabilities.setDocumentSymbolProvider(true);
    TextDocumentSyncOptions textDocumentSyncOptions = new TextDocumentSyncOptions();
    textDocumentSyncOptions.setOpenClose(Boolean.TRUE);
    textDocumentSyncOptions.setSave(new SaveOptions(Boolean.TRUE));
    textDocumentSyncOptions.setChange(TextDocumentSyncKind.Incremental);
    serverCapabilities.setTextDocumentSync(textDocumentSyncOptions);
    InitializeResult initializeResult = new InitializeResult(serverCapabilities);
    return CompletableFuture.completedFuture(initializeResult);
  }

  @Override
  public CompletableFuture<Object> shutdown() {
    return CompletableFuture.completedFuture(new Object());
  }

  @Override
  public void exit() {
    System.exit(0);
  }

  @Override
  public TextDocumentService getTextDocumentService() {
    return this.gradleServices;
  }

  @Override
  public WorkspaceService getWorkspaceService() {
    return this.gradleServices;
  }

  @Override
  public void connect(LanguageClient client) {
    this.gradleServices.connect(client);
  }
}
