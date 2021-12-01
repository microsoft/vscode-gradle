// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.google.common.base.Charsets;
import com.google.common.io.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.DocumentSymbol;
import org.eclipse.lsp4j.DocumentSymbolParams;
import org.eclipse.lsp4j.MessageActionItem;
import org.eclipse.lsp4j.MessageParams;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.ShowMessageRequestParams;
import org.eclipse.lsp4j.SymbolInformation;
import org.eclipse.lsp4j.SymbolKind;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextDocumentItem;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.lsp4j.services.LanguageClient;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class GradleDocumentSymbolTest {

	private GradleServices services;

	@BeforeEach
	void setup() {
		services = new GradleServices();
		services.connect(new LanguageClient() {
			@Override
			public void telemetryEvent(Object object) {

			}

			@Override
			public CompletableFuture<MessageActionItem> showMessageRequest(ShowMessageRequestParams requestParams) {
				return null;
			}

			@Override
			public void showMessage(MessageParams messageParams) {

			}

			@Override
			public void publishDiagnostics(PublishDiagnosticsParams diagnostics) {

			}

			@Override
			public void logMessage(MessageParams message) {

			}
		});
	}

	@Test
	public void testDocumentSymbols() throws Exception {
		Path filePath = GradleTestConstants.testPath.resolve("app").resolve("build.gradle").normalize();
		String content = Files.asCharSource(filePath.toFile(), Charsets.UTF_8).read();
		String uri = filePath.toUri().toString();
		TextDocumentItem textDocumentItem = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1, content);
		services.didOpen(new DidOpenTextDocumentParams(textDocumentItem));
		DocumentSymbolParams params = new DocumentSymbolParams(new TextDocumentIdentifier(uri));
		CompletableFuture<List<Either<SymbolInformation, DocumentSymbol>>> results = services.documentSymbol(params);
		List<Either<SymbolInformation, DocumentSymbol>> documentSymbolList = results.get();
		Assertions.assertEquals(7, documentSymbolList.size());
		DocumentSymbol symbol0 = documentSymbolList.get(0).getRight();
		Assertions.assertNotNull(symbol0);
		Assertions.assertEquals("plugins", symbol0.getName());
		Assertions.assertEquals(SymbolKind.Function, symbol0.getKind());
		Assertions.assertEquals(symbol0.getRange(), new Range(new Position(0, 0), new Position(3, 1)));
		DocumentSymbol symbol4 = documentSymbolList.get(4).getRight();
		Assertions.assertNotNull(symbol4);
		Assertions.assertEquals("repositories", symbol4.getName());
		Assertions.assertEquals(SymbolKind.Function, symbol4.getKind());
		Assertions.assertEquals(symbol4.getRange(), new Range(new Position(13, 0), new Position(15, 1)));
	}
}
