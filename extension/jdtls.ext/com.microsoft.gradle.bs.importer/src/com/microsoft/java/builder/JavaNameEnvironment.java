/*******************************************************************************
 * Copyright (c) 2023 Microsoft Corporation and others.
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
package com.microsoft.java.builder;

import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.WorkingCopyOwner;
import org.eclipse.jdt.core.compiler.CharOperation;
import org.eclipse.jdt.internal.compiler.env.IModule;
import org.eclipse.jdt.internal.compiler.env.NameEnvironmentAnswer;
import org.eclipse.jdt.internal.compiler.util.SimpleLookupTable;
import org.eclipse.jdt.internal.core.CompilationGroup;
import org.eclipse.jdt.internal.core.JavaProject;
import org.eclipse.jdt.internal.core.SearchableEnvironment;

import com.microsoft.java.builder.jdtbuilder.BuildNotifier;
import com.microsoft.java.builder.jdtbuilder.NameEnvironment;

public class JavaNameEnvironment extends NameEnvironment {
	SearchableEnvironment delegateEnvironment;

	public JavaNameEnvironment(IJavaProject javaProject, CompilationGroup compilationGroup) throws CoreException {
		super(javaProject, compilationGroup);
		this.delegateEnvironment = new SearchableEnvironment((JavaProject) javaProject, (WorkingCopyOwner) null, compilationGroup == CompilationGroup.MAIN);
	}

	public JavaNameEnvironment(IWorkspaceRoot root, JavaProject javaProject,
			SimpleLookupTable binaryLocationsPerProject, BuildNotifier notifier, CompilationGroup compilationGroup)
			throws CoreException {
		super(root, javaProject, binaryLocationsPerProject, notifier, compilationGroup);
		this.delegateEnvironment = new SearchableEnvironment(javaProject, (WorkingCopyOwner) null, compilationGroup == CompilationGroup.MAIN);
	}

	@Override
	public NameEnvironmentAnswer findType(char[][] compoundName, char[] moduleName) {
		return this.delegateEnvironment.findType(compoundName, moduleName);
	}

	@Override
	public NameEnvironmentAnswer findType(char[] typeName, char[][] packageName, char[] moduleName) {
		return this.delegateEnvironment.findType(typeName, packageName, moduleName);
	}

	@Override
	public char[][] getAllAutomaticModules() {
		return this.delegateEnvironment.getAllAutomaticModules();
	}

	@Override
	public char[][] getModulesDeclaringPackage(char[][] packageName, char[] moduleName) {
		return this.delegateEnvironment.getModulesDeclaringPackage(packageName, moduleName);
	}

	@Override
	public boolean isPackage(String qualifiedPackageName, char[] moduleName) {
		if (qualifiedPackageName == null) {
			return false;
		}

		char[][] names = CharOperation.splitAndTrimOn('.', qualifiedPackageName.toCharArray());
		return getModulesDeclaringPackage(names, moduleName) != null;
	}

	@Override
	public char[][] listPackages(char[] moduleName) {
		return this.delegateEnvironment.listPackages(moduleName);
	}

	@Override
	public IModule getModule(char[] name) {
		return this.delegateEnvironment.getModule(name);
	}

	@Override
	public boolean hasCompilationUnit(char[][] qualifiedPackageName, char[] moduleName, boolean checkCUs) {
		return this.delegateEnvironment.hasCompilationUnit(qualifiedPackageName, moduleName, checkCUs);
	}
}
