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
package com.microsoft.gradle.handlers;

import java.io.InputStreamReader;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.microsoft.gradle.compile.CompletionVisitor.DependencyItem;
import com.microsoft.gradle.utils.LSPUtils;

import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.jsonrpc.messages.Either;

public class DependencyCompletionHandler {
  private DependencyItem dependency;
  private Position position;
  private static String URL_BASIC_SEARCH = "https://search.maven.org/solrsearch/select?q=";

  private enum DependencyCompletionKind {
    ID, VERSION
  }

  public List<CompletionItem> getDependencyCompletionItems(DependencyItem dependency, Position position) {
    this.dependency = dependency;
    this.position = position;
    String validText = LSPUtils.getStringBeforePosition(dependency.getText(), dependency.getRange(), position);
    String[] validTexts = validText.split(":", -1);
    switch (validTexts.length) {
      case 1:
        return getDependenciesForInCompleteGroup(validTexts[0]);
      case 2:
        return getDependenciesForInCompleteArtifact(validTexts[0]);
      case 3:
        return getDependenciesForVersion(validTexts[0], validTexts[1]);
      default:
        return Collections.emptyList();
    }
  }

  private List<CompletionItem> getDependenciesForInCompleteGroup(String group) {
    if (group.length() < 3) {
      return Collections.emptyList();
    }
    StringBuilder builder = new StringBuilder();
    builder.append(URL_BASIC_SEARCH);
    builder.append(group);
    builder.append("&rows=50&wt=json");
    return getDependenciesFromRestAPI(builder.toString(), DependencyCompletionKind.ID);
  }

  private List<CompletionItem> getDependenciesForInCompleteArtifact(String group) {
    if (group.length() < 3) {
      return Collections.emptyList();
    }
    StringBuilder builder = new StringBuilder();
    builder.append(URL_BASIC_SEARCH);
    builder.append("g:%22");
    builder.append(group);
    builder.append("%22&rows=50&wt=json");
    return getDependenciesFromRestAPI(builder.toString(), DependencyCompletionKind.ID);
  }

  private List<CompletionItem> getDependenciesForVersion(String group, String artifact) {
    if (group.length() < 3 || artifact.length() < 3) {
      return Collections.emptyList();
    }
    StringBuilder builder = new StringBuilder();
    builder.append(URL_BASIC_SEARCH);
    builder.append("g:%22");
    builder.append(group);
    builder.append("%22+AND+a:%22");
    builder.append(artifact);
    builder.append("%22&core=gav&rows=50&wt=json");
    return getDependenciesFromRestAPI(builder.toString(), DependencyCompletionKind.VERSION);
  }

  private List<CompletionItem> getDependenciesFromRestAPI(String url, DependencyCompletionKind kind) {
    try (InputStreamReader reader = new InputStreamReader(new URL(url).openStream())) {
      JsonObject jsonResult = new Gson().fromJson(reader, JsonObject.class);
      JsonObject response = jsonResult.getAsJsonObject("response");
      JsonArray docs = response.getAsJsonArray("docs");
      List<CompletionItem> completions = new ArrayList<>();
      for (int i = 0; i < docs.size(); i++) {
        JsonElement element = docs.get(i);
        if (element instanceof JsonObject) {
          CompletionItem completionItem = new CompletionItem();
          JsonElement labelContent = ((JsonObject) element).get("id");
          String label = labelContent.getAsJsonPrimitive().getAsString();
          TextEdit textEdit = new TextEdit(new Range(this.dependency.getRange().getStart(), this.position), label);
          completionItem.setTextEdit(Either.forLeft(textEdit));
          if (kind == DependencyCompletionKind.ID) {
            completionItem.setLabel(label);
            completionItem.setTextEdit(Either.forLeft(textEdit));
            completionItem.setKind(CompletionItemKind.Module);
            completionItem.setDetail("mavenCentral");
          } else {
            String version = ((JsonObject) element).get("v").getAsJsonPrimitive().getAsString();
            completionItem.setLabel(version);
            completionItem.setFilterText(label + ":" + version);
            completionItem.setKind(CompletionItemKind.Text);
            completionItem.setDetail("version");
          }
          // Currently we have no more than 50 results, so the padding values should have at least 3 digits.
          completionItem.setSortText(String.format("%03d", i));
          completions.add(completionItem);
        }
      }
      return completions;
    } catch (Exception e) {
      // TODO
    }
    return Collections.emptyList();
  }
}
