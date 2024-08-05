// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.microsoft.gradle.semantictokens.TokenModifier;
import com.microsoft.gradle.semantictokens.TokenType;
import com.microsoft.gradle.transport.NamedPipeStream;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;
import org.eclipse.lsp4j.CompletionOptions;
import org.eclipse.lsp4j.DocumentFilter;
import org.eclipse.lsp4j.ExecuteCommandOptions;
import org.eclipse.lsp4j.InitializeParams;
import org.eclipse.lsp4j.InitializeResult;
import org.eclipse.lsp4j.SaveOptions;
import org.eclipse.lsp4j.SemanticTokensLegend;
import org.eclipse.lsp4j.SemanticTokensServerFull;
import org.eclipse.lsp4j.SemanticTokensWithRegistrationOptions;
import org.eclipse.lsp4j.ServerCapabilities;
import org.eclipse.lsp4j.SetTraceParams;
import org.eclipse.lsp4j.TextDocumentSyncKind;
import org.eclipse.lsp4j.TextDocumentSyncOptions;
import org.eclipse.lsp4j.WorkspaceFolder;
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
			NamedPipeStream pipeStream = new NamedPipeStream(args[0]);

			Launcher<LanguageClient> launcher;
			launcher = Launcher.createLauncher(server, LanguageClient.class, pipeStream.getInputStream(),
					pipeStream.getOutputStream());
			server.connect(launcher.getRemoteProxy());
			launcher.startListening();
		} catch (IOException e) {
			throw new RuntimeException("Gradle language server start failed", e);
		}

	}

	public GradleLanguageServer() {
		this.gradleServices = new GradleServices();
	}

	@Override
	public CompletableFuture<InitializeResult> initialize(InitializeParams params) {
		Map<?, ?> initOptions = new Gson().fromJson((JsonElement) params.getInitializationOptions(), Map.class);
		// TODO: support multiple workspace folders
		List<WorkspaceFolder> workspaceFolders = params.getWorkspaceFolders();
		if (workspaceFolders != null) {
			for (WorkspaceFolder folder : workspaceFolders) {
				URI uri = URI.create(folder.getUri());
				this.gradleServices.getLibraryResolver().setWorkspacePath(Paths.get(uri));
				break;
			}
		}
		Object settings = initOptions.get("settings");
		this.gradleServices.applySetting(settings);
		ServerCapabilities serverCapabilities = new ServerCapabilities();
		SemanticTokensWithRegistrationOptions semanticOptions = new SemanticTokensWithRegistrationOptions();
		semanticOptions.setFull(new SemanticTokensServerFull(false));
		semanticOptions.setRange(false);
		semanticOptions.setDocumentSelector(Arrays.asList(new DocumentFilter("gradle", "file", null)));
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
		CompletionOptions completionOptions = new CompletionOptions(false, Arrays.asList(".", ":"));
		serverCapabilities.setCompletionProvider(completionOptions);
		serverCapabilities.setExecuteCommandProvider(new ExecuteCommandOptions(GradleServices.supportedCommands));
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

	@Override
	public void setTrace(SetTraceParams params) {
		// Override to avoid exception throw by the default implementation
	}
}
