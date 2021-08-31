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

package com.microsoft.gradle.compile;

import java.security.CodeSource;

import org.codehaus.groovy.control.CompilationUnit;
import org.codehaus.groovy.control.CompilerConfiguration;

import groovy.lang.GroovyClassLoader;

public class GradleCompilationUnit extends CompilationUnit {
  private Integer version;
  private GradleASTVisitor visitor;

  public GradleCompilationUnit(CompilerConfiguration configuration, CodeSource codeSource, GroovyClassLoader loader, Integer version) {
    super(configuration, codeSource, loader);
    this.version = version;
    this.visitor = new GradleASTVisitor(this);
  }

  public Integer getVersion() {
    return this.version;
  }

  public GradleASTVisitor getVisitor() {
    return this.visitor;
  }
}
