// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.utils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.eclipse.lsp4j.Command;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.jsonrpc.messages.Either;

public class CompletionUtils {

	public static String completionCommand = "gradle.completion";
	public static String completionTitle = "completion";

	public enum CompletionKinds {
		DEPENDENCY_GROUP("dependency_group"), DEPENDENCY_ARTIFACT("dependency_artifact"), DEPENDENCY_VERSION(
				"dependency_version"), METHOD_CALL("method_call"), PROPERTY("property");

		private final String text;

		CompletionKinds(final String text) {
			this.text = text;
		}

		@Override
		public String toString() {
			return text;
		}
	}

	public static List<CompletionItem> getGroupIdCompletions(String text, Range range, Collection<String> keys,
			String sequence) {
		List<String> results = CompletionUtils.sortResults(text, keys);
		List<CompletionItem> items = new ArrayList<>();
		for (int i = 0; i < results.size(); i++) {
			String groupId = results.get(i);
			CompletionItem completionItem = new CompletionItem();
			TextEdit textEdit = new TextEdit(range, groupId + ":");
			completionItem.setTextEdit(Either.forLeft(textEdit));
			completionItem.setLabel(groupId);
			completionItem.setKind(CompletionItemKind.Module);
			completionItem.setDetail("GroupID: " + groupId);
			completionItem.setSortText(sequence + String.format("%08d", i));
			List<Object> arguments = new ArrayList<>();
			arguments.add(CompletionKinds.DEPENDENCY_GROUP.toString());
			arguments.add(groupId);
			completionItem.setCommand(new Command(completionTitle, completionCommand, arguments));
			items.add(completionItem);
		}
		return items;
	}

	public static List<CompletionItem> getArtifactIdCompletions(String groupId, String text, Range range,
			Collection<String> keys, String sequence) {
		List<String> results = CompletionUtils.sortResults(text, keys);
		List<CompletionItem> items = new ArrayList<>();
		// ${groupId}:${artifactId}
		int character = range.getStart().getCharacter() + groupId.length() + 1;
		Range replaceRange = new Range(new Position(range.getStart().getLine(), character), range.getEnd());
		for (int i = 0; i < results.size(); i++) {
			String artifactId = results.get(i);
			CompletionItem completionItem = new CompletionItem();
			TextEdit textEdit = new TextEdit(replaceRange, artifactId + ":");
			completionItem.setTextEdit(Either.forLeft(textEdit));
			completionItem.setLabel(artifactId);
			completionItem.setKind(CompletionItemKind.Module);
			completionItem.setDetail("ArtifactID: " + artifactId);
			completionItem.setSortText(sequence + String.format("%08d", i));
			List<Object> arguments = new ArrayList<>();
			arguments.add(CompletionKinds.DEPENDENCY_ARTIFACT.toString());
			arguments.add(groupId + ":" + artifactId);
			completionItem.setCommand(new Command(completionTitle, completionCommand, arguments));
			items.add(completionItem);
		}
		return items;
	}

	public static List<String> sortResults(String text, Collection<String> keys) {
		if (text.isEmpty()) {
			return new ArrayList<>(keys);
		}
		// priority: key equals text > text is the prefix of key > key contains text
		List<String> equals = new ArrayList<>();
		List<String> prefixes = new ArrayList<>();
		List<String> contains = new ArrayList<>();
		keys.forEach(id -> {
			if (id.equals(text)) {
				equals.add(id);
			} else if (id.startsWith(text)) {
				prefixes.add(id);
			} else if (id.contains(text)) {
				contains.add(id);
			}
		});
		return Stream.of(equals, prefixes, contains).flatMap(Collection::stream).collect(Collectors.toList());
	}
}
