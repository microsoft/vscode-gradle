// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.semantictokens;

import org.eclipse.lsp4j.SemanticTokenTypes;

public enum TokenType {
	FUNCTION(SemanticTokenTypes.Function), PROPERTY(SemanticTokenTypes.Property), VARIABLE(
			SemanticTokenTypes.Variable), PARAMETER(SemanticTokenTypes.Parameter);

	private String genericName;

	TokenType(String genericName) {
		this.genericName = genericName;
	}

	@Override
	public String toString() {
		return genericName;
	}
}
