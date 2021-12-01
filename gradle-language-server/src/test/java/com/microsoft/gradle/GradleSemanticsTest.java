// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.google.common.base.Charsets;
import com.google.common.io.Files;
import com.microsoft.gradle.semantictokens.SemanticToken;
import com.microsoft.gradle.semantictokens.TokenType;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.MessageActionItem;
import org.eclipse.lsp4j.MessageParams;
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.SemanticTokens;
import org.eclipse.lsp4j.SemanticTokensParams;
import org.eclipse.lsp4j.ShowMessageRequestParams;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextDocumentItem;
import org.eclipse.lsp4j.services.LanguageClient;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class GradleSemanticsTest {

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
	public void testSemanticTokensFull() throws Exception {
		Path filePath = GradleTestConstants.testPath.resolve("app").resolve("build.gradle").normalize();
		String content = Files.asCharSource(filePath.toFile(), Charsets.UTF_8).read();
		String uri = filePath.toUri().toString();
		TextDocumentItem textDocumentItem = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1, content);
		services.didOpen(new DidOpenTextDocumentParams(textDocumentItem));
		SemanticTokensParams params = new SemanticTokensParams(new TextDocumentIdentifier(uri));
		CompletableFuture<SemanticTokens> tokens = services.semanticTokensFull(params);
		List<Integer> encodedData = tokens.get().getData();
		Assertions.assertEquals(135, encodedData.size());
		List<SemanticToken> decodeTokens = decodeTokens(encodedData);
		Assertions.assertEquals(27, decodeTokens.size());
		Assertions.assertEquals(1, decodeTokens.get(0).getLine());
		Assertions.assertEquals(1, decodeTokens.get(0).getColumn());
		Assertions.assertEquals(7, decodeTokens.get(0).getLength());
		Assertions.assertEquals(TokenType.FUNCTION, decodeTokens.get(0).getTokenType());
		Assertions.assertEquals(0, decodeTokens.get(0).getTokenModifiers());
		Assertions.assertEquals(11, decodeTokens.get(10).getLine());
		Assertions.assertEquals(69, decodeTokens.get(10).getColumn());
		Assertions.assertEquals(19, decodeTokens.get(10).getLength());
		Assertions.assertEquals(TokenType.VARIABLE, decodeTokens.get(10).getTokenType());
		Assertions.assertEquals(0, decodeTokens.get(10).getTokenModifiers());
	}

	private static List<SemanticToken> decodeTokens(List<Integer> encodedData) {
		if (encodedData.size() % 5 != 0) {
			// invalid data list
			return Collections.emptyList();
		}
		List<SemanticToken> tokens = new ArrayList<>();
		int line = 1;
		int column = 1;
		for (int i = 0; i < encodedData.size(); i += 5) {
			int deltaLine = encodedData.get(i);
			int deltaColumn = encodedData.get(i + 1);
			int length = encodedData.get(i + 2);
			int tokenTypeIndex = encodedData.get(i + 3);
			int tokenModifiers = encodedData.get(i + 4);
			line += deltaLine;
			column += deltaColumn;
			tokens.add(new SemanticToken(line, column, length, TokenType.values()[tokenTypeIndex], tokenModifiers));
		}
		return tokens;
	}
}
