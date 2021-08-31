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

package com.microsoft.gradle.utils;

import org.codehaus.groovy.syntax.SyntaxException;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;

public class GradleUtils {
  public static Range getExpressionLSPRange(SyntaxException exp) {
    // LSP Range start from 0, while groovy classes start from 1
    return new Range(new Position(exp.getStartLine() - 1, exp.getStartColumn() - 1),
        new Position(exp.getEndLine() - 1, exp.getEndColumn() - 1));
  }
}
