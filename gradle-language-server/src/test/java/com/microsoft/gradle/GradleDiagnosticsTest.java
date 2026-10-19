// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.google.common.base.Charsets;
import com.google.common.io.Files;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import groovyjarjarasm.asm.ClassWriter;
import groovyjarjarasm.asm.MethodVisitor;
import groovyjarjarasm.asm.Opcodes;
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
import org.junit.jupiter.api.io.TempDir;

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
			Assertions.assertEquals("Unexpected input: '{' @ line 1, column 9.", diagnostic.getMessage());
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

	@Test
	public void testJava17ScriptClasspath(@TempDir Path projectPath) throws Exception {
		assertScriptClasspathDiagnostics(projectPath, 61);
	}

	@Test
	public void testJava25ScriptClasspath(@TempDir Path projectPath) throws Exception {
		assertScriptClasspathDiagnostics(projectPath, 69);
	}

	@Test
	public void testJava27ScriptClasspath(@TempDir Path projectPath) throws Exception {
		assertScriptClasspathDiagnostics(projectPath, 71);
	}

	private void assertScriptClasspathDiagnostics(Path projectPath, int classFileVersion) throws Exception {
		Path classesPath = projectPath.resolve("buildSrc").resolve("build").resolve("classes").resolve("java")
				.resolve("main");
		Path classFile = classesPath.resolve("org").resolve("microsoft").resolve("gradle").resolve("test")
				.resolve("ClasspathType.class");
		java.nio.file.Files.createDirectories(classFile.getParent());
		// Generate target bytecode without requiring that JDK on the test runner.
		ClassWriter writer = new ClassWriter(0);
		writer.visit(classFileVersion, Opcodes.ACC_PUBLIC, "org/microsoft/gradle/test/ClasspathType", null,
				"java/lang/Object", null);
		MethodVisitor constructor = writer.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
		constructor.visitCode();
		constructor.visitVarInsn(Opcodes.ALOAD, 0);
		constructor.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false);
		constructor.visitInsn(Opcodes.RETURN);
		constructor.visitMaxs(1, 1);
		constructor.visitEnd();
		writer.visitEnd();
		java.nio.file.Files.write(classFile, writer.toByteArray());

		String uri = projectPath.resolve("build.gradle").toUri().toString();
		TextDocumentItem document = new TextDocumentItem(uri, GradleTestConstants.LANGUAGE_GRADLE, 1,
				"import org.microsoft.gradle.test.ClasspathType\ndef example = new ClasspathType()\n");
		services.didOpen(new DidOpenTextDocumentParams(document));
		Assertions.assertEquals(1, diagnosticsStorage.size());
		Assertions.assertFalse(diagnosticsStorage.get(0).getDiagnostics().isEmpty());
		diagnosticsStorage.clear();

		Gson gson = new GsonBuilder().create();
		ExecuteCommandParams params = new ExecuteCommandParams("gradle.setScriptClasspaths",
				List.of(gson.toJsonTree(projectPath.toString(), String.class),
						gson.toJsonTree(new String[]{classesPath.toString()}, String[].class)));
		services.executeCommand(params).get();

		Assertions.assertEquals(1, diagnosticsStorage.size());
		Assertions.assertEquals(uri, diagnosticsStorage.get(0).getUri());
		Assertions.assertTrue(diagnosticsStorage.get(0).getDiagnostics().isEmpty(),
				() -> diagnosticsStorage.get(0).getDiagnostics().toString());
	}
}
