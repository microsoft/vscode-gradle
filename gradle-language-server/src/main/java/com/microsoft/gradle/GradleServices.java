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

import com.microsoft.gradle.manager.GradleFilesManager;

import org.eclipse.lsp4j.DidChangeConfigurationParams;
import org.eclipse.lsp4j.DidChangeTextDocumentParams;
import org.eclipse.lsp4j.DidChangeWatchedFilesParams;
import org.eclipse.lsp4j.DidCloseTextDocumentParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.DidSaveTextDocumentParams;
import org.eclipse.lsp4j.services.LanguageClient;
import org.eclipse.lsp4j.services.LanguageClientAware;
import org.eclipse.lsp4j.services.TextDocumentService;
import org.eclipse.lsp4j.services.WorkspaceService;

public class GradleServices implements TextDocumentService, WorkspaceService, LanguageClientAware {

  private GradleFilesManager gradleFilesManager;

  public GradleServices() {
    this.gradleFilesManager = new GradleFilesManager();
  }

  @Override
  public void connect(LanguageClient client) {
    // TODO
  }

  @Override
  public void didOpen(DidOpenTextDocumentParams params) {
    gradleFilesManager.didOpen(params);
  }

  @Override
  public void didChange(DidChangeTextDocumentParams params) {
    gradleFilesManager.didChange(params);
  }

  @Override
  public void didClose(DidCloseTextDocumentParams params) {
    gradleFilesManager.didClose(params);
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
}
