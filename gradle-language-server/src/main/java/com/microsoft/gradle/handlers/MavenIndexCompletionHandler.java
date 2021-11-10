// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.handlers;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import com.microsoft.gradle.compile.CompletionVisitor.DependencyItem;
import com.microsoft.gradle.utils.CompletionUtils;
import com.microsoft.gradle.utils.LSPUtils;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;

public class MavenIndexCompletionHandler {
	private static String sequence = "0";
	private String indexFile = "/ArtifactUsage.json";
	private List<String> sortedGroupIds;
	// <groupId, sorted artifactIds>
	private Map<String, List<String>> sortedRepository = new HashMap<>();

	public MavenIndexCompletionHandler() {
		try {
			InputStream inputStream = MavenIndexCompletionHandler.class.getResourceAsStream(indexFile);
			Map<String, Integer> artifactUsageDict = new Gson().fromJson(
					new JsonReader(new InputStreamReader(inputStream)), new TypeToken<HashMap<String, Integer>>() {
					}.getType());
			Map<String, Integer> groupIdDict = new HashMap<>();
			for (Map.Entry<String, Integer> entry : artifactUsageDict.entrySet()) {
				String[] ids = entry.getKey().split(":");
				Integer usage = entry.getValue();
				if (ids.length < 2) {
					continue;
				}
				String group = ids[0];
				String artifact = ids[1];
				if (groupIdDict.containsKey(group)) {
					Integer value = groupIdDict.get(group);
					value += usage;
				} else {
					groupIdDict.put(group, usage);
				}
				if (this.sortedRepository.containsKey(group)) {
					this.sortedRepository.get(group).add(artifact);
				} else {
					List<String> artifacts = new ArrayList<>();
					artifacts.add(artifact);
					this.sortedRepository.put(group, artifacts);
				}
			}
			// generate sortedGroupIds
			this.sortedGroupIds = new ArrayList<>(groupIdDict.keySet());
			Comparator<String> comparator = getComparator(groupIdDict);
			this.sortedGroupIds.sort(comparator);
			// sort out sortedRepository
			for (Map.Entry<String, List<String>> entry : this.sortedRepository.entrySet()) {
				String groupId = entry.getKey();
				List<String> artifacts = entry.getValue();
				if (artifacts.size() == 1) {
					continue;
				}
				Comparator<String> comparator1 = getComparator(artifactUsageDict, groupId);
				artifacts.sort(comparator1);
			}
		} catch (Exception e) {
			// Do nothing
		}
	}

	private Comparator<String> getComparator(Map<String, Integer> dict, String groupId) {
		Comparator<String> comparator = Comparator.comparingInt(text -> dict.get(groupId + ":" + text));
		comparator = comparator.reversed();
		return comparator;
	}

	private Comparator<String> getComparator(Map<String, Integer> dict) {
		Comparator<String> comparator = Comparator.comparingInt(text -> dict.get(text));
		comparator = comparator.reversed();
		return comparator;
	}

	public List<CompletionItem> getDependencyCompletionItems(DependencyItem dependency, Position position) {
		Range range = new Range(dependency.getRange().getStart(), position);
		String validText = LSPUtils.getStringBeforePosition(dependency.getText(), dependency.getRange(), position);
		String[] validTexts = validText.split(":", -1);
		switch (validTexts.length) {
			case 1 :
				return getGroupIdCompletions(validTexts[0], range);
			case 2 :
				return getArtifactIdCompletions(validTexts[0], validTexts[1], range);
			default :
				// Do not provide index results for version
				return Collections.emptyList();
		}
	}

	private List<CompletionItem> getGroupIdCompletions(String text, Range range) {
		return CompletionUtils.getGroupIdCompletions(text, range, this.sortedGroupIds, sequence);
	}

	private List<CompletionItem> getArtifactIdCompletions(String groupId, String text, Range range) {
		if (!this.sortedRepository.containsKey(groupId)) {
			return Collections.emptyList();
		}
		return CompletionUtils.getArtifactIdCompletions(groupId, text, range, this.sortedRepository.get(groupId),
				sequence);
	}
}
