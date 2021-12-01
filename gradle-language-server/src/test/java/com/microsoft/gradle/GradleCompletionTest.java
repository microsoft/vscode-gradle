// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.google.common.base.Charsets;
import com.google.common.io.Files;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.microsoft.gradle.resolver.GradleClosure;
import com.microsoft.gradle.resolver.GradleField;
import com.microsoft.gradle.resolver.GradleMethod;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.CompletionList;
import org.eclipse.lsp4j.CompletionParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.MessageActionItem;
import org.eclipse.lsp4j.MessageParams;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.ShowMessageRequestParams;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextDocumentItem;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.lsp4j.services.LanguageClient;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class GradleCompletionTest {

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
	public void testDependencyCompletions() throws Exception {
		Path filePath = GradleTestConstants.testPath.resolve("app").resolve("build.gradle").normalize();
		String content = Files.asCharSource(filePath.toFile(), Charsets.UTF_8).read();
		String uri = filePath.toUri().toString();
		TextDocumentItem textDocumentItem = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1, content);
		services.didOpen(new DidOpenTextDocumentParams(textDocumentItem));
		CompletionParams params = new CompletionParams(new TextDocumentIdentifier(uri), new Position(19, 37));
		CompletableFuture<Either<List<CompletionItem>, CompletionList>> result = services.completion(params);
		Assertions.assertTrue(
				completionItemExists(result.get().getLeft(), "org.springframework.boot", CompletionItemKind.Module));
	}

	@Test
	public void testDependencyIndexCompletions() throws Exception {
		Path filePath = GradleTestConstants.testPath.resolve("app").resolve("build.gradle").normalize();
		String content = Files.asCharSource(filePath.toFile(), Charsets.UTF_8).read();
		String uri = filePath.toUri().toString();
		TextDocumentItem textDocumentItem = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1, content);
		services.didOpen(new DidOpenTextDocumentParams(textDocumentItem));
		CompletionParams springBootArtifactParams = new CompletionParams(new TextDocumentIdentifier(uri),
				new Position(19, 43));
		CompletableFuture<Either<List<CompletionItem>, CompletionList>> springBootArtifactResults = services
				.completion(springBootArtifactParams);
		Assertions.assertTrue(completionItemExists(springBootArtifactResults.get().getLeft(), "spring-boot-devtools",
				CompletionItemKind.Module));
		CompletionParams orgGroupParams = new CompletionParams(new TextDocumentIdentifier(uri), new Position(19, 22));
		CompletableFuture<Either<List<CompletionItem>, CompletionList>> orgGroupResults = services
				.completion(orgGroupParams);
		Assertions.assertTrue(
				completionItemExists(orgGroupResults.get().getLeft(), "org.slf4j", CompletionItemKind.Module));
	}

	@Test
	public void testClosureCompletions() throws Exception {
		Path filePath = GradleTestConstants.testPath.resolve("app").resolve("build.gradle").normalize();
		String content = Files.asCharSource(filePath.toFile(), Charsets.UTF_8).read();
		String uri = filePath.toUri().toString();
		TextDocumentItem textDocumentItem = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1, content);
		services.didOpen(new DidOpenTextDocumentParams(textDocumentItem));
		ExecuteCommandParams params = new ExecuteCommandParams();
		params.setCommand("gradle.setClosures");
		List<Object> arguments = new ArrayList<>();
		Gson gson = new GsonBuilder().create();
		String projectPath = GradleTestConstants.testPath.resolve("app").normalize().toString();
		GradleField field1 = new GradleField("sourceCompatibility", false);
		GradleField field2 = new GradleField("targetCompatibility", false);
		GradleMethod method1 = new GradleMethod("withJavadocJar", new String[]{}, false);
		GradleMethod method2 = new GradleMethod("getToolchain", new String[]{}, false);
		GradleClosure closure = new GradleClosure("java", new GradleMethod[]{method1, method2},
				new GradleField[]{field1, field2});
		GradleClosure[] closures = {closure};
		arguments.add(gson.toJsonTree(projectPath, String.class));
		arguments.add(gson.toJsonTree(closures, GradleClosure[].class));
		params.setArguments(arguments);
		services.executeCommand(params);
		CompletableFuture<Either<List<CompletionItem>, CompletionList>> result = services
				.completion(new CompletionParams(new TextDocumentIdentifier(uri), new Position(12, 0)));
		Assertions.assertTrue(
				completionItemExists(result.get().getLeft(), "java(Closure c)", CompletionItemKind.Function));
		CompletableFuture<Either<List<CompletionItem>, CompletionList>> resultInClosure = services
				.completion(new CompletionParams(new TextDocumentIdentifier(uri), new Position(8, 6)));
		List<CompletionItem> resultInClosureList = resultInClosure.get().getLeft();
		Assertions
				.assertTrue(completionItemExists(resultInClosureList, "withJavadocJar()", CompletionItemKind.Function));
		Assertions.assertTrue(completionItemExists(resultInClosureList, "getToolchain()", CompletionItemKind.Function));
		Assertions.assertTrue(
				completionItemExists(resultInClosureList, "sourceCompatibility", CompletionItemKind.Property));
		Assertions.assertTrue(
				completionItemExists(resultInClosureList, "targetCompatibility", CompletionItemKind.Property));
	}

	private static boolean completionItemExists(List<CompletionItem> items, String label, CompletionItemKind kind) {
		if (items == null || items.isEmpty()) {
			return false;
		}
		for (CompletionItem item : items) {
			if (item.getLabel().equals(label) && item.getKind().equals(kind)) {
				return true;
			}
		}
		return false;
	}
}
