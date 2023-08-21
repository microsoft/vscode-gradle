/*******************************************************************************
 * Copyright (c) 2000, 2006 IBM Corporation and others.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copied from https://github.com/eclipse-jdt/eclipse.jdt.core/blob/master/org.eclipse.jdt.core/model/org/eclipse/jdt/internal/core/builder/AbortIncrementalBuildException.java
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
package com.microsoft.java.builder.jdtbuilder;

/**
 * Exception thrown when an incremental builder cannot find a .class file.
 * Its possible the type can no longer be found because it was renamed inside its existing
 * source file.
 */
public class AbortIncrementalBuildException extends RuntimeException {

protected String qualifiedTypeName;
private static final long serialVersionUID = -8874662133883858502L; // backward compatible

public AbortIncrementalBuildException(String qualifiedTypeName) {
	this.qualifiedTypeName = qualifiedTypeName;
}
}
