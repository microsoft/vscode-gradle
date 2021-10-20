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

import java.util.Arrays;
import java.util.List;

public class GradleDefaultImport {

  // See:
  // https://docs.gradle.org/current/userguide/writing_build_scripts.html#script-default-imports
  public static List<String> defaultStarImports = Arrays.asList("org.gradle", "org.gradle.api",
      "org.gradle.api.artifacts", "org.gradle.api.artifacts.component", "org.gradle.api.artifacts.dsl",
      "org.gradle.api.artifacts.ivy", "org.gradle.api.artifacts.maven", "org.gradle.api.artifacts.query",
      "org.gradle.api.artifacts.repositories", "org.gradle.api.artifacts.result", "org.gradle.api.artifacts.transform",
      "org.gradle.api.artifacts.type", "org.gradle.api.artifacts.verification", "org.gradle.api.attributes",
      "org.gradle.api.attributes.java", "org.gradle.api.attributes.plugin", "org.gradle.api.capabilities",
      "org.gradle.api.component", "org.gradle.api.credentials", "org.gradle.api.distribution",
      "org.gradle.api.distribution.plugins", "org.gradle.api.execution", "org.gradle.api.file",
      "org.gradle.api.initialization", "org.gradle.api.initialization.definition", "org.gradle.api.initialization.dsl",
      "org.gradle.api.initialization.resolve", "org.gradle.api.invocation", "org.gradle.api.java.archives",
      "org.gradle.api.jvm", "org.gradle.api.logging", "org.gradle.api.logging.configuration", "org.gradle.api.model",
      "org.gradle.api.plugins", "org.gradle.api.plugins.antlr", "org.gradle.api.plugins.catalog",
      "org.gradle.api.plugins.quality", "org.gradle.api.plugins.scala", "org.gradle.api.provider",
      "org.gradle.api.publish", "org.gradle.api.publish.ivy", "org.gradle.api.publish.ivy.plugins",
      "org.gradle.api.publish.ivy.tasks", "org.gradle.api.publish.maven", "org.gradle.api.publish.maven.plugins",
      "org.gradle.api.publish.maven.tasks", "org.gradle.api.publish.plugins", "org.gradle.api.publish.tasks",
      "org.gradle.api.reflect", "org.gradle.api.reporting", "org.gradle.api.reporting.components",
      "org.gradle.api.reporting.dependencies", "org.gradle.api.reporting.dependents", "org.gradle.api.reporting.model",
      "org.gradle.api.reporting.plugins", "org.gradle.api.resources", "org.gradle.api.services", "org.gradle.api.specs",
      "org.gradle.api.tasks", "org.gradle.api.tasks.ant", "org.gradle.api.tasks.application",
      "org.gradle.api.tasks.bundling", "org.gradle.api.tasks.compile", "org.gradle.api.tasks.diagnostics",
      "org.gradle.api.tasks.incremental", "org.gradle.api.tasks.javadoc", "org.gradle.api.tasks.options",
      "org.gradle.api.tasks.scala", "org.gradle.api.tasks.testing", "org.gradle.api.tasks.testing.junit",
      "org.gradle.api.tasks.testing.junitplatform", "org.gradle.api.tasks.testing.testng", "org.gradle.api.tasks.util",
      "org.gradle.api.tasks.wrapper", "org.gradle.authentication", "org.gradle.authentication.aws",
      "org.gradle.authentication.http", "org.gradle.build.event", "org.gradle.buildinit.plugins",
      "org.gradle.buildinit.tasks", "org.gradle.caching", "org.gradle.caching.configuration", "org.gradle.caching.http",
      "org.gradle.caching.local", "org.gradle.concurrent", "org.gradle.external.javadoc", "org.gradle.ide.visualstudio",
      "org.gradle.ide.visualstudio.plugins", "org.gradle.ide.visualstudio.tasks", "org.gradle.ide.xcode",
      "org.gradle.ide.xcode.plugins", "org.gradle.ide.xcode.tasks", "org.gradle.ivy", "org.gradle.jvm",
      "org.gradle.jvm.application.scripts", "org.gradle.jvm.application.tasks", "org.gradle.jvm.tasks",
      "org.gradle.jvm.toolchain", "org.gradle.language", "org.gradle.language.assembler",
      "org.gradle.language.assembler.plugins", "org.gradle.language.assembler.tasks", "org.gradle.language.base",
      "org.gradle.language.base.artifact", "org.gradle.language.base.compile", "org.gradle.language.base.plugins",
      "org.gradle.language.base.sources", "org.gradle.language.c", "org.gradle.language.c.plugins",
      "org.gradle.language.c.tasks", "org.gradle.language.cpp", "org.gradle.language.cpp.plugins",
      "org.gradle.language.cpp.tasks", "org.gradle.language.java.artifact", "org.gradle.language.jvm.tasks",
      "org.gradle.language.nativeplatform", "org.gradle.language.nativeplatform.tasks",
      "org.gradle.language.objectivec", "org.gradle.language.objectivec.plugins",
      "org.gradle.language.objectivec.tasks", "org.gradle.language.objectivecpp",
      "org.gradle.language.objectivecpp.plugins", "org.gradle.language.objectivecpp.tasks",
      "org.gradle.language.plugins", "org.gradle.language.rc", "org.gradle.language.rc.plugins",
      "org.gradle.language.rc.tasks", "org.gradle.language.scala.tasks", "org.gradle.language.swift",
      "org.gradle.language.swift.plugins", "org.gradle.language.swift.tasks", "org.gradle.maven", "org.gradle.model",
      "org.gradle.nativeplatform", "org.gradle.nativeplatform.platform", "org.gradle.nativeplatform.plugins",
      "org.gradle.nativeplatform.tasks", "org.gradle.nativeplatform.test", "org.gradle.nativeplatform.test.cpp",
      "org.gradle.nativeplatform.test.cpp.plugins", "org.gradle.nativeplatform.test.cunit",
      "org.gradle.nativeplatform.test.cunit.plugins", "org.gradle.nativeplatform.test.cunit.tasks",
      "org.gradle.nativeplatform.test.googletest", "org.gradle.nativeplatform.test.googletest.plugins",
      "org.gradle.nativeplatform.test.plugins", "org.gradle.nativeplatform.test.tasks",
      "org.gradle.nativeplatform.test.xctest", "org.gradle.nativeplatform.test.xctest.plugins",
      "org.gradle.nativeplatform.test.xctest.tasks", "org.gradle.nativeplatform.toolchain",
      "org.gradle.nativeplatform.toolchain.plugins", "org.gradle.normalization", "org.gradle.platform.base",
      "org.gradle.platform.base.binary", "org.gradle.platform.base.component", "org.gradle.platform.base.plugins",
      "org.gradle.plugin.devel", "org.gradle.plugin.devel.plugins", "org.gradle.plugin.devel.tasks",
      "org.gradle.plugin.management", "org.gradle.plugin.use", "org.gradle.plugins.ear",
      "org.gradle.plugins.ear.descriptor", "org.gradle.plugins.ide", "org.gradle.plugins.ide.api",
      "org.gradle.plugins.ide.eclipse", "org.gradle.plugins.ide.idea", "org.gradle.plugins.signing",
      "org.gradle.plugins.signing.signatory", "org.gradle.plugins.signing.signatory.pgp",
      "org.gradle.plugins.signing.type", "org.gradle.plugins.signing.type.pgp", "org.gradle.process",
      "org.gradle.swiftpm", "org.gradle.swiftpm.plugins", "org.gradle.swiftpm.tasks", "org.gradle.testing.base",
      "org.gradle.testing.base.plugins", "org.gradle.testing.jacoco.plugins", "org.gradle.testing.jacoco.tasks",
      "org.gradle.testing.jacoco.tasks.rules", "org.gradle.testkit.runner", "org.gradle.util", "org.gradle.vcs",
      "org.gradle.vcs.git", "org.gradle.work", "org.gradle.workers");
}
