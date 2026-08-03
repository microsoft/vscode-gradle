// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.handlers;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.microsoft.gradle.compile.CompletionVisitor.DependencyItem;
import com.microsoft.gradle.utils.CompletionUtils;
import com.microsoft.gradle.utils.CompletionUtils.CompletionKinds;
import com.microsoft.gradle.utils.LSPUtils;
import java.io.InputStreamReader;
import java.net.URL;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.eclipse.lsp4j.Command;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.jsonrpc.messages.Either;

public class MavenCentralCompletionHandler {
	private static String sequence = "2";
	private static String URL_BASIC_SEARCH = "https://search.maven.org/solrsearch/select?q=";
	private enum DependencyCompletionKind {
		GROUPID, ARTIFACTID, VERSION
	}

	public List<CompletionItem> getDependencyCompletionItems(DependencyItem dependency, Position position) {
		Range range = new Range(dependency.getRange().getStart(), position);
		String validText = LSPUtils.getStringBeforePosition(dependency.getText(), dependency.getRange(), position);
		String[] validTexts = validText.split(":", -1);
		switch (validTexts.length) {
			case 1 :
				return getGroupIdCompletions(validTexts[0], range);
			case 2 :
				return getArtifactIdCompletions(validTexts[0], range);
			case 3 :
				return getVersionCompletions(validTexts[0], validTexts[1], range);
			default :
				return Collections.emptyList();
		}
	}

	private List<CompletionItem> getGroupIdCompletions(String group, Range range) {
		if (group.length() < 3) {
			return Collections.emptyList();
		}
		StringBuilder builder = new StringBuilder();
		builder.append(URL_BASIC_SEARCH);
		builder.append(group);
		// limit the number of result to 50
		builder.append("&rows=50&wt=json");
		return getDependenciesFromRestAPI(builder.toString(), DependencyCompletionKind.GROUPID, range);
	}

	private List<CompletionItem> getArtifactIdCompletions(String group, Range range) {
		if (group.length() < 3) {
			return Collections.emptyList();
		}
		StringBuilder builder = new StringBuilder();
		builder.append(URL_BASIC_SEARCH);
		builder.append("g:%22");
		builder.append(group);
		// limit the number of result to 50
		builder.append("%22&rows=50&wt=json");
		return getDependenciesFromRestAPI(builder.toString(), DependencyCompletionKind.ARTIFACTID, range);
	}

	private List<CompletionItem> getVersionCompletions(String group, String artifact, Range range) {
		if (group.length() < 3 || artifact.length() < 3) {
			return Collections.emptyList();
		}
		StringBuilder builder = new StringBuilder();
		builder.append(URL_BASIC_SEARCH);
		builder.append("g:%22");
		builder.append(group);
		builder.append("%22+AND+a:%22");
		builder.append(artifact);
		// limit the number of result to 50
		builder.append("%22&core=gav&rows=50&wt=json");
		return getDependenciesFromRestAPI(builder.toString(), DependencyCompletionKind.VERSION, range);
	}

	private List<CompletionItem> getDependenciesFromRestAPI(String url, DependencyCompletionKind kind, Range range) {
		try (InputStreamReader reader = new InputStreamReader(new URL(url).openStream())) {
			JsonObject jsonResult = new Gson().fromJson(reader, JsonObject.class);
			JsonObject response = jsonResult.getAsJsonObject("response");
			JsonArray docs = response.getAsJsonArray("docs");
			List<CompletionItem> completions = new ArrayList<>();
			for (int i = 0; i < docs.size(); i++) {
				JsonElement element = docs.get(i);
				if (element instanceof JsonObject) {
					CompletionItem completionItem = new CompletionItem();
					String groupId = ((JsonObject) element).get("g").getAsJsonPrimitive().getAsString();
					String artifactId = ((JsonObject) element).get("a").getAsJsonPrimitive().getAsString();
					List<Object> arguments = new ArrayList<>();
					if (kind == DependencyCompletionKind.GROUPID) {
						TextEdit textEdit = new TextEdit(range, groupId + ":");
						completionItem.setTextEdit(Either.forLeft(textEdit));
						completionItem.setLabel(groupId);
						completionItem.setKind(CompletionItemKind.Module);
						completionItem.setDetail("GroupID: " + groupId);
						completionItem.setCommand(
								new Command(CompletionUtils.completionTitle, CompletionUtils.completionCommand));
						arguments.add(CompletionKinds.DEPENDENCY_GROUP.toString());
						arguments.add(groupId);
					} else if (kind == DependencyCompletionKind.ARTIFACTID) {
						// ${groupId}:${artifactId}
						int character = range.getStart().getCharacter() + groupId.length() + 1;
						Range replaceRange = new Range(new Position(range.getStart().getLine(), character),
								range.getEnd());
						TextEdit textEdit = new TextEdit(replaceRange, artifactId + ":");
						completionItem.setTextEdit(Either.forLeft(textEdit));
						completionItem.setLabel(artifactId);
						completionItem.setKind(CompletionItemKind.Module);
						completionItem.setDetail("ArtifactID: " + artifactId);
						completionItem.setCommand(
								new Command(CompletionUtils.completionTitle, CompletionUtils.completionCommand));
						arguments.add(CompletionKinds.DEPENDENCY_ARTIFACT.toString());
						arguments.add(groupId + ":" + artifactId);
					} else if (kind == DependencyCompletionKind.VERSION) {
						String version = ((JsonObject) element).get("v").getAsJsonPrimitive().getAsString();
						String timestampValue = ((JsonObject) element).get("timestamp").getAsJsonPrimitive()
								.getAsString();
						Timestamp timestamp = new Timestamp(Long.parseLong(timestampValue));
						Date date = new Date(timestamp.getTime());
						// ${groupId}:${artifactId}:${version}
						int character = range.getStart().getCharacter() + groupId.length() + 1 + artifactId.length()
								+ 1;
						Range replaceRange = new Range(new Position(range.getStart().getLine(), character),
								range.getEnd());
						TextEdit textEdit = new TextEdit(replaceRange, version);
						completionItem.setTextEdit(Either.forLeft(textEdit));
						completionItem.setLabel(version);
						completionItem.setKind(CompletionItemKind.Constant);
						completionItem.setDetail("Updated: " + date.toString());
						arguments.add(CompletionKinds.DEPENDENCY_VERSION.toString());
						arguments.add(groupId + ":" + artifactId + ":" + version);
					}
					completionItem.setCommand(
							new Command(CompletionUtils.completionTitle, CompletionUtils.completionCommand, arguments));
					completionItem.setSortText(sequence + String.format("%08d", i));
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
