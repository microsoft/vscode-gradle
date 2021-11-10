// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.utils;

import java.io.File;
import java.net.URI;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.function.Predicate;

public class Utils {

	public static String getFileNameWithoutExtension(Path fileName) {
		String nameWithExtension = fileName.toString();
		int index = nameWithExtension.lastIndexOf('.');
		if (index > 0 && index < nameWithExtension.length() - 1) {
			return nameWithExtension.substring(0, index);
		}
		return null;
	}

	public static boolean isValidFile(File file) {
		return file != null && file.exists();
	}

	public static boolean isValidFolder(File folder) {
		return folder != null && folder.exists() && folder.isDirectory();
	}

	public static File findSubFolder(File rootFolder, String name) {
		if (!isValidFolder(rootFolder)) {
			return null;
		}
		for (File file : rootFolder.listFiles()) {
			if (file.isDirectory() && file.getName().equals(name)) {
				return file;
			}
		}
		return null;
	}

	public static List<String> listAllFiles(File folder) {
		if (!isValidFolder(folder)) {
			return Collections.emptyList();
		}
		List<String> allFiles = new ArrayList<>();
		for (File file : folder.listFiles()) {
			if (file.isDirectory()) {
				allFiles.addAll(listAllFiles(file));
			} else {
				allFiles.add(file.getAbsolutePath());
			}
		}
		return allFiles;
	}

	public static List<File> listAllFiles(File folder, String ext) {
		if (!isValidFolder(folder)) {
			return Collections.emptyList();
		}
		List<File> allFiles = new ArrayList<>();
		for (File file : folder.listFiles()) {
			if (file.isDirectory()) {
				allFiles.addAll(listAllFiles(file, ext));
			} else if (file.getName().endsWith(ext)) {
				allFiles.add(file);
			}
		}
		return allFiles;
	}

	public static String getFolderPath(URI uri) {
		Path path = Paths.get(uri);
		Path folderPath = path.getParent();
		if (folderPath == null) {
			return null;
		}
		return folderPath.toString();
	}

	public static <T> Predicate<T> distinctByKey(Function<? super T, ?> keyExtractor) {
		Set<Object> seen = ConcurrentHashMap.newKeySet();
		return t -> seen.add(keyExtractor.apply(t));
	}
}
