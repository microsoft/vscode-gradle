// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.manager;

import com.microsoft.gradle.compile.GradleCompilationUnit;
import com.microsoft.gradle.compile.GradleDefaultImport;
import com.microsoft.gradle.utils.Utils;
import groovy.lang.GroovyClassLoader;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.SourceUnit;
import org.codehaus.groovy.control.customizers.ImportCustomizer;
import org.codehaus.groovy.control.io.StringReaderSource;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;

public class GradleFilesManager {
	private Map<URI, String> openFiles = new HashMap<>();
	private Map<URI, GradleCompilationUnit> unitStorage = new HashMap<>();
	private Map<String, CompilerConfiguration> configs = new HashMap<>();
	private Map<String, List<String>> scriptClasspaths = new HashMap<>();
	private List<String> gradleLibraries = new ArrayList<>();

	private CompilerConfiguration createCompilerConfiguration() {
		CompilerConfiguration config = new CompilerConfiguration();
		ImportCustomizer customizer = new ImportCustomizer();
		customizer.addStarImports(GradleDefaultImport.defaultStarImports
				.toArray(new String[GradleDefaultImport.defaultStarImports.size()]));
		config.addCompilationCustomizers(customizer);
		return config;
	}

	public void setScriptClasspaths(String projectPath, List<String> scriptClasspaths) {
		this.scriptClasspaths.put(projectPath, scriptClasspaths);
		this.createOrUpdateConfig(projectPath);
	}

	public void setGradleLibraries(List<String> gradleLibraries) {
		this.gradleLibraries = gradleLibraries;
		for (String projectPath : this.configs.keySet()) {
			this.createOrUpdateConfig(projectPath);
		}
	}

	private CompilerConfiguration createOrUpdateConfig(String projectPath) {
		List<String> classpathList = new ArrayList<>();
		List<String> classpaths = this.scriptClasspaths.get(projectPath);
		if (classpaths != null) {
			classpathList.addAll(classpaths);
		}
		classpathList.addAll(this.gradleLibraries);
		if (this.configs.containsKey(projectPath)) {
			CompilerConfiguration config = this.configs.get(projectPath);
			config.setClasspathList(classpathList);
			return config;
		} else {
			CompilerConfiguration config = createCompilerConfiguration();
			config.setClasspathList(classpathList);
			this.configs.put(projectPath, config);
			return config;
		}
	}

	public Map<URI, GradleCompilationUnit> getUnitStorage() {
		return this.unitStorage;
	}

	public void didOpen(URI uri, String content) {
		openFiles.put(uri, content);
	}

	public void didChange(URI uri, TextDocumentContentChangeEvent change) {
		String oldText = openFiles.get(uri);
		Range range = change.getRange();
		if (range == null) {
			openFiles.put(uri, change.getText());
		} else {
			int offsetStart = getOffset(oldText, change.getRange().getStart());
			int offsetEnd = getOffset(oldText, change.getRange().getEnd());
			StringBuilder builder = new StringBuilder();
			builder.append(oldText.substring(0, offsetStart));
			builder.append(change.getText());
			builder.append(oldText.substring(offsetEnd));
			openFiles.put(uri, builder.toString());
		}
	}

	public void didClose(URI uri) {
		openFiles.remove(uri);
		this.unitStorage.remove(uri);
		String projectPath = Utils.getFolderPath(uri);
		this.configs.remove(projectPath);
		this.scriptClasspaths.remove(projectPath);
	}

	public String getContents(URI uri) {
		if (openFiles.containsKey(uri)) {
			return openFiles.get(uri);
		}
		return null;
	}

	public int getOffset(String string, Position position) {
		int line = position.getLine();
		int character = position.getCharacter();
		int currentIndex = 0;
		if (line > 0) {
			BufferedReader reader = new BufferedReader(new StringReader(string));
			try {
				int readLines = 0;
				while (true) {
					char currentChar = (char) reader.read();
					if (currentChar == -1) {
						return -1;
					}
					currentIndex++;
					if (currentChar == '\n') {
						readLines++;
						if (readLines == line) {
							break;
						}
					}
				}
				reader.close();
			} catch (IOException e) {
				return -1;
			}
		}
		return currentIndex + character;
	}

	public GradleCompilationUnit getCompilationUnit(URI uri, Integer version, boolean forceRecompile) {
		if (!forceRecompile && this.unitStorage.containsKey(uri)
				&& this.unitStorage.get(uri).getVersion().equals(version)) {
			return this.unitStorage.get(uri);
		}
		String projectPath = Utils.getFolderPath(uri);
		CompilerConfiguration config = createOrUpdateConfig(projectPath);
		GroovyClassLoader classLoader = new GroovyClassLoader(ClassLoader.getSystemClassLoader().getParent(), config,
				true);
		GradleCompilationUnit unit = new GradleCompilationUnit(config, null, classLoader, version);
		SourceUnit sourceUnit = new SourceUnit(uri.toString(),
				new StringReaderSource(getContents(uri), unit.getConfiguration()), unit.getConfiguration(),
				unit.getClassLoader(), unit.getErrorCollector());
		unit.addSource(sourceUnit);
		this.unitStorage.put(uri, unit);
		return unit;
	}

	public GradleCompilationUnit getCompilationUnit(URI uri) {
		// if there is no version info provided, we return the newest version
		// when the previous cu exists, otherwise return null
		if (this.unitStorage.containsKey(uri)) {
			return this.unitStorage.get(uri);
		}
		return null;
	}
}
