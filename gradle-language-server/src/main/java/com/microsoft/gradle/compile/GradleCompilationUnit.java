// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.compile;

import groovy.lang.GroovyClassLoader;
import java.security.CodeSource;
import org.codehaus.groovy.control.CompilationUnit;
import org.codehaus.groovy.control.CompilerConfiguration;

public class GradleCompilationUnit extends CompilationUnit {
	private Integer version;

	public GradleCompilationUnit(CompilerConfiguration configuration, CodeSource codeSource, GroovyClassLoader loader,
			Integer version) {
		super(configuration, codeSource, loader);
		this.version = version;
	}

	public Integer getVersion() {
		return this.version;
	}
}
