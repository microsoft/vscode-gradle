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

package com.microsoft.gradle.manager;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;

import com.microsoft.gradle.compile.GradleCompilationUnit;

import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.SourceUnit;
import org.codehaus.groovy.control.io.StringReaderSource;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;

import groovy.lang.GroovyClassLoader;

public class GradleFilesManager {
  private Map<URI, String> openFiles = new HashMap<>();
  private Map<URI, GradleCompilationUnit> unitStorage = new HashMap<>();

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

  public synchronized GradleCompilationUnit getCompilationUnit(URI uri, Integer version) {
    if (this.unitStorage.containsKey(uri) && this.unitStorage.get(uri).getVersion().equals(version)) {
      return this.unitStorage.get(uri);
    }
    CompilerConfiguration config = new CompilerConfiguration();
    GroovyClassLoader classLoader = new GroovyClassLoader(ClassLoader.getSystemClassLoader().getParent(), config, true);
    GradleCompilationUnit unit = new GradleCompilationUnit(config, null, classLoader, version);
    SourceUnit sourceUnit = new SourceUnit(uri.toString(),
        new StringReaderSource(getContents(uri), unit.getConfiguration()),
        unit.getConfiguration(), unit.getClassLoader(), unit.getErrorCollector());
    unit.addSource(sourceUnit);
    this.unitStorage.put(uri, unit);
    return unit;
  }

}
