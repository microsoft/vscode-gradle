/*******************************************************************************
 * Copyright (c) 2000, 2010 IBM Corporation and others.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copied from https://github.com/eclipse-jdt/eclipse.jdt.core/blob/master/org.eclipse.jdt.core/model/org/eclipse/jdt/internal/core/builder/AdditionalTypeCollection.java
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
package com.microsoft.java.builder.jdtbuilder;

public class AdditionalTypeCollection extends ReferenceCollection {

char[][] definedTypeNames;

protected AdditionalTypeCollection(char[][] definedTypeNames, char[][][] qualifiedReferences, char[][] simpleNameReferences, char[][] rootReferences) {
	super(qualifiedReferences, simpleNameReferences, rootReferences);
	this.definedTypeNames = definedTypeNames; // do not bother interning member type names (i.e. 'A$M')
}
}

