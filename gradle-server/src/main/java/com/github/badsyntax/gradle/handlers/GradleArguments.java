package com.github.badsyntax.gradle.handlers;

import com.google.common.base.Strings;
import java.util.ArrayList;
import java.util.List;

public final class GradleArguments {

	private GradleArguments() {
	}

	public static List<String> parseJvmArguments(String arguments) {
		List<String> result = new ArrayList<>();
		if (Strings.isNullOrEmpty(arguments)) {
			return result;
		}
		StringBuilder current = new StringBuilder();
		char quote = 0;
		for (int index = 0; index < arguments.length(); index++) {
			char currentChar = arguments.charAt(index);
			if (quote == 0 && Character.isWhitespace(currentChar)) {
				addArgument(result, current);
				continue;
			}
			if (currentChar == '\'' || currentChar == '"') {
				if (quote == 0) {
					quote = currentChar;
					continue;
				}
				if (quote == currentChar) {
					quote = 0;
					continue;
				}
			}
			if (currentChar == '\\' && index + 1 < arguments.length()) {
				char nextChar = arguments.charAt(index + 1);
				if (nextChar == '\'' || nextChar == '"' || Character.isWhitespace(nextChar) || nextChar == '\\') {
					current.append(nextChar);
					index++;
					continue;
				}
			}
			current.append(currentChar);
		}
		addArgument(result, current);
		return result;
	}

	private static void addArgument(List<String> result, StringBuilder current) {
		if (current.length() == 0) {
			return;
		}
		result.add(current.toString());
		current.setLength(0);
	}
}