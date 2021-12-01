// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.google.common.base.Charsets;
import com.google.common.io.Files;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.eclipse.lsp4j.Diagnostic;
import org.eclipse.lsp4j.DiagnosticSeverity;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.MessageActionItem;
import org.eclipse.lsp4j.MessageParams;
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.ShowMessageRequestParams;
import org.eclipse.lsp4j.TextDocumentItem;
import org.eclipse.lsp4j.services.LanguageClient;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class GradleDiagnosticsTest {

	private static String TEST_PROJECT_PATH = "./test-resources/diagnostics";
	private static String CLASSPATH_TEST_PROJECT_PATH = "./test-resources/diagnostics-classpath";
	private final List<PublishDiagnosticsParams> diagnosticsStorage = new ArrayList<>();
	private GradleServices services;
	private Path testPath;
	private Path classpathTestPath;

	@BeforeEach
	void setup() {
		testPath = Paths.get(System.getProperty("user.dir")).resolve(TEST_PROJECT_PATH);
		classpathTestPath = Paths.get(System.getProperty("user.dir")).resolve(CLASSPATH_TEST_PROJECT_PATH);
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
				diagnosticsStorage.add(diagnostics);
			}

			@Override
			public void logMessage(MessageParams message) {

			}
		});
	}

	@Test
	public void testPublishSyntaxDiagnostics() throws Exception {
		Path filePath = testPath.resolve("build.gradle").normalize();
		String content = Files.asCharSource(filePath.toFile(), Charsets.UTF_8).read();
		String uri = filePath.toUri().toString();
		TextDocumentItem textDocumentItem = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1, content);
		services.didOpen(new DidOpenTextDocumentParams(textDocumentItem));
		for (PublishDiagnosticsParams param : this.diagnosticsStorage) {
			String paramUri = param.getUri();
			if (!paramUri.equals(uri)) {
				continue;
			}
			List<Diagnostic> diagnostics = param.getDiagnostics();
			Assertions.assertEquals(1, diagnostics.size());
			Diagnostic diagnostic = diagnostics.get(0);
			Assertions.assertEquals(DiagnosticSeverity.Error, diagnostic.getSeverity());
			Assertions.assertEquals("Gradle", diagnostic.getSource());
			Assertions.assertEquals("expecting '}', found '' @ line 8, column 2.", diagnostic.getMessage());
			return;
		}
		Assertions.fail("Can't get corresponding diagnostics for the test file.");
	}

	@Test
	public void testPublishClasspathDiagnostics() throws Exception {
		Path filePath = classpathTestPath.resolve("build.gradle").normalize();
		String content = Files.asCharSource(filePath.toFile(), Charsets.UTF_8).read();
		String uri = filePath.toUri().toString();
		TextDocumentItem textDocumentItem = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1, content);
		services.didOpen(new DidOpenTextDocumentParams(textDocumentItem));
		for (PublishDiagnosticsParams param : this.diagnosticsStorage) {
			String paramUri = param.getUri();
			if (!paramUri.equals(uri)) {
				continue;
			}
			List<Diagnostic> diagnostics = param.getDiagnostics();
			Assertions.assertEquals(1, diagnostics.size());
			Diagnostic diagnostic = diagnostics.get(0);
			Assertions.assertEquals(DiagnosticSeverity.Error, diagnostic.getSeverity());
			Assertions.assertEquals("Gradle", diagnostic.getSource());
			Assertions.assertEquals(
					"unable to resolve class org.microsoft.gradle.test.ClasspathType\n @ line 1, column 8.",
					diagnostic.getMessage());
			return;
		}
		Assertions.fail("Can't get corresponding diagnostics for the test file.");
	}

	@Test
	public void testResolveClasspathDiagnostics() throws Exception {
		Path filePath = classpathTestPath.resolve("build.gradle").normalize();
		String content = Files.asCharSource(filePath.toFile(), Charsets.UTF_8).read();
		String uri = filePath.toUri().toString();
		TextDocumentItem textDocumentItem = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1, content);
		ExecuteCommandParams params = new ExecuteCommandParams();
		params.setCommand("gradle.setScriptClasspaths");
		List<Object> arguments = new ArrayList<>();
		Gson gson = new GsonBuilder().create();
		String projectPath = classpathTestPath.normalize().toString();
		String[] scriptClasspaths = {classpathTestPath.resolve("classpath.jar").normalize().toString()};
		arguments.add(gson.toJsonTree(projectPath, String.class));
		arguments.add(gson.toJsonTree(scriptClasspaths, String[].class));
		params.setArguments(arguments);
		services.executeCommand(params);
		services.didOpen(new DidOpenTextDocumentParams(textDocumentItem));
		for (PublishDiagnosticsParams param : this.diagnosticsStorage) {
			String paramUri = param.getUri();
			if (!paramUri.equals(uri)) {
				continue;
			}
			List<Diagnostic> diagnostics = param.getDiagnostics();
			Assertions.assertEquals(0, diagnostics.size());
			return;
		}
		Assertions.fail("Can't get corresponding diagnostics for the test file.");
	}
}
