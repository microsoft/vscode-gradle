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
 * Copied from https://github.com/eclipse-jdt/eclipse.jdt.core/blob/master/org.eclipse.jdt.core/model/org/eclipse/jdt/internal/core/builder/WorkQueue.java
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
package com.microsoft.java.builder.jdtbuilder;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class WorkQueue {

private Set<SourceFile> needsCompileList;
private Set<SourceFile> compiledList;

public WorkQueue() {
	this.needsCompileList = new HashSet<>();
	this.compiledList = new HashSet<>();
}

public void add(SourceFile element) {
	this.needsCompileList.add(element);
}

public void addAll(SourceFile[] elements) {
	this.needsCompileList.addAll(Arrays.asList(elements));
}

public void clear() {
	this.needsCompileList.clear();
	this.compiledList.clear();
}

public void finished(SourceFile element) {
	this.needsCompileList.remove(element);
	this.compiledList.add(element);
}

public boolean isCompiled(SourceFile element) {
	return this.compiledList.contains(element);
}

public boolean isWaiting(SourceFile element) {
	return this.needsCompileList.contains(element);
}

@Override
public String toString() {
	return "WorkQueue: " + this.needsCompileList; //$NON-NLS-1$
}
}
