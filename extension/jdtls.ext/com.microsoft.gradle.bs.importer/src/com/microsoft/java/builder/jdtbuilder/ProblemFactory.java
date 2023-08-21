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
 * Copied from https://github.com/eclipse-jdt/eclipse.jdt.core/blob/master/org.eclipse.jdt.core/model/org/eclipse/jdt/internal/core/builder/ProblemFactory.java
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
package com.microsoft.java.builder.jdtbuilder;

import org.eclipse.jdt.internal.compiler.problem.DefaultProblemFactory;
import org.eclipse.jdt.internal.compiler.util.SimpleLookupTable;

import java.util.*;

public class ProblemFactory extends DefaultProblemFactory {

static SimpleLookupTable factories = new SimpleLookupTable(5);

private ProblemFactory(Locale locale) {
	super(locale);
}

public static ProblemFactory getProblemFactory(Locale locale) {
	ProblemFactory factory = (ProblemFactory) factories.get(locale);
	if (factory == null)
		factories.put(locale, factory = new ProblemFactory(locale));
	return factory;
}
}
