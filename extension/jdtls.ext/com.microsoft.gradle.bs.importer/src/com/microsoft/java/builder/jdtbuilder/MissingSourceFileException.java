/*******************************************************************************
 * Copyright (c) 2000, 2009 IBM Corporation and others.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copied from https://github.com/eclipse-jdt/eclipse.jdt.core/blob/master/org.eclipse.jdt.core/model/org/eclipse/jdt/internal/core/builder/MissingSourceFileException.java
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
package com.microsoft.java.builder.jdtbuilder;

/**
 * Exception thrown when the build should be aborted because a source file is missing/empty.
 */
public class MissingSourceFileException extends RuntimeException {

	protected String missingSourceFile;
	private static final long serialVersionUID = -1416609004971115719L; // backward compatible

public MissingSourceFileException(String missingSourceFile) {
	this.missingSourceFile = missingSourceFile;
}
}
