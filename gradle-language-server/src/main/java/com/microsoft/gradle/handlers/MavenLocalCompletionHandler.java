// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.handlers;

import com.microsoft.gradle.compile.CompletionVisitor.DependencyItem;
import com.microsoft.gradle.utils.CompletionUtils;
import com.microsoft.gradle.utils.LSPUtils;
import com.microsoft.gradle.utils.Utils;
import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;

public class MavenLocalCompletionHandler {
	private static String sequence = "1";
	private List<String> sortedGroupIds;
	// <groupId, sorted artifactIds>
	private Map<String, List<String>> localRepository = new HashMap<>();

	public MavenLocalCompletionHandler() {
		Path localRepositoryPath = Paths.get(System.getProperty("user.home"), ".m2", "repository");
		List<File> pomFiles = Utils.listAllFiles(localRepositoryPath.toFile(), "pom");
		Set<String> groupIds = new HashSet<>();
		for (File pomFile : pomFiles) {
			Path path = pomFile.toPath();
			Path relativePath = localRepositoryPath.relativize(path);
			int nameCount = relativePath.getNameCount();
			// path scheme: GroupIds/ArtifactId/Version/*.pom
			if (nameCount < 4) {
				continue;
			}
			String artifactId = relativePath.getName(nameCount - 3).toString();
			List<String> groupIdParts = new ArrayList<>();
			relativePath.subpath(0, nameCount - 3).iterator().forEachRemaining(e -> groupIdParts.add(e.toString()));
			String groupId = String.join(".", groupIdParts);
			groupIds.add(groupId);
			if (this.localRepository.containsKey(groupId)) {
				this.localRepository.get(groupId).add(artifactId);
			} else {
				List<String> artifactIds = new ArrayList<>();
				artifactIds.add(artifactId);
				this.localRepository.put(groupId, artifactIds);
			}
		}
		this.sortedGroupIds = new ArrayList<>(groupIds);
		Collections.sort(this.sortedGroupIds);
		for (List<String> artifacts : this.localRepository.values()) {
			artifacts = artifacts.stream().distinct().collect(Collectors.toList());
			Collections.sort(artifacts);
		}
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
				// Do not provide local results for version
				return Collections.emptyList();
		}
	}

	private List<CompletionItem> getGroupIdCompletions(String text, Range range) {
		return CompletionUtils.getGroupIdCompletions(text, range, this.localRepository.keySet(), sequence);
	}

	private List<CompletionItem> getArtifactIdCompletions(String groupId, String text, Range range) {
		if (!this.localRepository.containsKey(groupId)) {
			return Collections.emptyList();
		}
		return CompletionUtils.getArtifactIdCompletions(groupId, text, range, this.localRepository.get(groupId),
				sequence);
	}
}
