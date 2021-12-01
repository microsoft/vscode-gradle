// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.semantictokens;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class SemanticToken {
	private final TokenType tokenType;
	private final int tokenModifiers;
	private final int line;
	private final int column;
	private final int length;

	public SemanticToken(int line, int column, int length, TokenType tokenType, int tokenModifiers) {
		this.line = line;
		this.column = column;
		this.length = length;
		this.tokenType = tokenType;
		this.tokenModifiers = tokenModifiers;
	}

	public TokenType getTokenType() {
		return tokenType;
	}

	public int getTokenModifiers() {
		return tokenModifiers;
	}

	public int getLine() {
		return line;
	}

	public int getColumn() {
		return column;
	}

	public int getLength() {
		return length;
	}

	// Note: similar logics as JDT.LS, but in groovy AST ranges start from 1
	public static List<Integer> encodedTokens(List<SemanticToken> tokens) {
		tokens.sort(new Comparator<SemanticToken>() {
			@Override
			public int compare(final SemanticToken a, final SemanticToken b) {
				int lineResult = Integer.valueOf(a.getLine()).compareTo(Integer.valueOf(b.getLine()));
				if (lineResult == 0) {
					return Integer.valueOf(a.getColumn()).compareTo(Integer.valueOf(b.getColumn()));
				}
				return lineResult;
			}
		});
		int numTokens = tokens.size();
		List<Integer> data = new ArrayList<>(numTokens * 5);
		int currentLine = 0;
		int currentColumn = 0;
		for (int i = 0; i < numTokens; i++) {
			SemanticToken token = tokens.get(i);
			int line = token.getLine() - 1;
			int column = token.getColumn() - 1;
			if (line < 0 || column < 0) {
				continue;
			}
			int deltaLine = line - currentLine;
			if (deltaLine != 0) {
				currentLine = line;
				currentColumn = 0;
			}
			int deltaColumn = column - currentColumn;
			currentColumn = column;
			// Disallow duplicate/conflict token (if exists)
			if (deltaLine != 0 || deltaColumn != 0 || i == 0) {
				int tokenTypeIndex = token.getTokenType().ordinal();
				int tokenModifiers = token.getTokenModifiers();
				data.add(deltaLine);
				data.add(deltaColumn);
				data.add(token.getLength());
				data.add(tokenTypeIndex);
				data.add(tokenModifiers);
			}
		}
		return data;
	}
}
