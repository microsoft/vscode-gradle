/*******************************************************************************
 * Copyright (c) 2021 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
*******************************************************************************/
package com.microsoft.gradle.semantictokens;

import org.eclipse.lsp4j.SemanticTokenTypes;

public enum TokenType {
  FUNCTION(SemanticTokenTypes.Function), PROPERTY(SemanticTokenTypes.Property), VARIABLE(SemanticTokenTypes.Variable),
  PARAMETER(SemanticTokenTypes.Parameter);

  private String genericName;

  TokenType(String genericName) {
    this.genericName = genericName;
  }

  @Override
  public String toString() {
    return genericName;
  }
}
