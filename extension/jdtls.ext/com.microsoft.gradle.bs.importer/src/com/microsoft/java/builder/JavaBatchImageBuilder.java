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

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;

import org.eclipse.core.resources.IContainer;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IResourceProxy;
import org.eclipse.core.resources.IResourceProxyVisitor;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.Path;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.internal.compiler.ClassFile;
import org.eclipse.jdt.internal.compiler.CompilationResult;
import org.eclipse.jdt.internal.compiler.Compiler;
import org.eclipse.jdt.internal.compiler.DefaultErrorHandlingPolicies;
import org.eclipse.jdt.internal.compiler.ast.CompilationUnitDeclaration;
import org.eclipse.jdt.internal.compiler.classfmt.ClassFileConstants;
import org.eclipse.jdt.internal.compiler.env.AccessRestriction;
import org.eclipse.jdt.internal.compiler.env.ISourceType;
import org.eclipse.jdt.internal.compiler.impl.CompilerOptions;
import org.eclipse.jdt.internal.compiler.lookup.LookupEnvironment;
import org.eclipse.jdt.internal.compiler.lookup.PackageBinding;
import org.eclipse.jdt.internal.compiler.parser.SourceTypeConverter;
import org.eclipse.jdt.internal.compiler.util.SuffixConstants;
import org.eclipse.jdt.internal.core.CompilationGroup;
import org.eclipse.jdt.internal.core.SourceTypeElementInfo;
import org.eclipse.jdt.internal.core.util.Util;

import com.microsoft.java.builder.jdtbuilder.BatchImageBuilder;
import com.microsoft.java.builder.jdtbuilder.ClasspathMultiDirectory;
import com.microsoft.java.builder.jdtbuilder.JavaBuilder;
import com.microsoft.java.builder.jdtbuilder.ProblemFactory;
import com.microsoft.java.builder.jdtbuilder.SourceFile;

public class JavaBatchImageBuilder extends BatchImageBuilder {
	public JavaBatchImageBuilder(BatchImageBuilder batchImageBuilder, boolean buildStarting,
			CompilationGroup compilationGroup) {
		super(batchImageBuilder, buildStarting, compilationGroup);
	}

	public JavaBatchImageBuilder(JavaBuilder javaBuilder, boolean buildStarting, CompilationGroup compilationGroup) {
		super(javaBuilder, buildStarting, compilationGroup);
	}

	@Override
	protected void addAllSourceFiles(LinkedHashSet<SourceFile> sourceFiles) throws CoreException {
		for (int i = 0, l = this.sourceLocations.length; i < l; i++) {
			final ClasspathMultiDirectory sourceLocation = this.sourceLocations[i];
			final char[][] exclusionPatterns = sourceLocation.exclusionPatterns;
			final char[][] inclusionPatterns = sourceLocation.inclusionPatterns;
			final IContainer sourceFolder = sourceLocation.sourceFolder;
			final boolean isAlsoProject = sourceFolder.equals(((JavaProblemChecker) this.javaBuilder).currentProject);
			sourceFolder.accept(
				new IResourceProxyVisitor() {
					@Override
					public boolean visit(IResourceProxy proxy) throws CoreException {
						switch(proxy.getType()) {
							case IResource.FILE :
								if (org.eclipse.jdt.internal.core.util.Util.isJavaLikeFileName(proxy.getName())) {
									IResource resource = proxy.requestResource();
									if (exclusionPatterns != null || inclusionPatterns != null)
										if (Util.isExcluded(resource.getFullPath(), inclusionPatterns, exclusionPatterns, false))
											return false;
									SourceFile unit = new SourceFile((IFile) resource, sourceLocation);
									sourceFiles.add(unit);
								}
								return false;
							case IResource.FOLDER :
								IPath folderPath = null;
								if (isAlsoProject)
									if (isExcludedFromProject(folderPath = proxy.requestFullPath()))
										return false;
								if (exclusionPatterns != null) {
									if (folderPath == null)
										folderPath = proxy.requestFullPath();
									if (Util.isExcluded(folderPath, inclusionPatterns, exclusionPatterns, true)) {
										// must walk children if inclusionPatterns != null, can skip them if == null
										// but folder is excluded so do not create it in the output folder
										return inclusionPatterns != null;
									}
								}
						}
						return true;
					}
				},
				IResource.NONE
			);
			this.notifier.checkCancel();
		}
	}

	@Override
	protected Compiler newCompiler() {
		// disable entire javadoc support if not interested in diagnostics
		Map<String, String> projectOptions = ((JavaProblemChecker) this.javaBuilder).javaProject.getOptions(true);
		String option = projectOptions.get(JavaCore.COMPILER_PB_INVALID_JAVADOC);
		if (option == null || option.equals(JavaCore.IGNORE)) { // TODO (frederic) see why option is null sometimes while running model tests!?
			option = projectOptions.get(JavaCore.COMPILER_PB_MISSING_JAVADOC_TAGS);
			if (option == null || option.equals(JavaCore.IGNORE)) {
				option = projectOptions.get(JavaCore.COMPILER_PB_MISSING_JAVADOC_COMMENTS);
				if (option == null || option.equals(JavaCore.IGNORE)) {
					option = projectOptions.get(JavaCore.COMPILER_PB_UNUSED_IMPORT);
					if (option == null || option.equals(JavaCore.IGNORE)) { // Unused import need also to look inside javadoc comment
						projectOptions.put(JavaCore.COMPILER_DOC_COMMENT_SUPPORT, JavaCore.DISABLED);
					}
				}
			}
		}

		// called once when the builder is initialized... can override if needed
		CompilerOptions compilerOptions = new CompilerOptions(projectOptions);
		compilerOptions.performMethodsFullRecovery = true;
		compilerOptions.performStatementsRecovery = true;
		Compiler newCompiler = createCompiler(compilerOptions);
		CompilerOptions options = newCompiler.options;
		// temporary code to allow the compiler to revert to a single thread
		String setting = System.getProperty("jdt.compiler.useSingleThread"); //$NON-NLS-1$
		newCompiler.useSingleThread = setting != null && setting.equals("true"); //$NON-NLS-1$

		// enable the compiler reference info support
		options.produceReferenceInfo = true;

		if (options.complianceLevel >= ClassFileConstants.JDK1_6
				&& options.processAnnotations) {
			// support for Java 6 annotation processors
			initializeAnnotationProcessorManager(newCompiler);
		}

		return newCompiler;
	}

	private Compiler createCompiler(CompilerOptions compilerOptions) {
		return new Compiler(
				this.nameEnvironment,
				DefaultErrorHandlingPolicies.proceedWithAllProblems(),
				compilerOptions,
				this,
				ProblemFactory.getProblemFactory(Locale.getDefault())) {
					@Override
					public void accept(ISourceType[] sourceTypes, PackageBinding packageBinding,
							AccessRestriction accessRestriction) {
						if (sourceTypes[0] instanceof SourceTypeElementInfo) {
							// ensure to jump back to toplevel type for first one (could be a member)
							while (sourceTypes[0].getEnclosingType() != null) {
								sourceTypes[0] = sourceTypes[0].getEnclosingType();
							}

							CompilationResult result =
								new CompilationResult(sourceTypes[0].getFileName(), 1, 1, this.options.maxProblemsPerUnit);

							// https://bugs.eclipse.org/bugs/show_bug.cgi?id=305259, build the compilation unit in its own sand box.
							final long savedComplianceLevel = this.options.complianceLevel;
							final long savedSourceLevel = this.options.sourceLevel;

							LookupEnvironment environment = packageBinding.environment;
							if (environment == null)
								environment = this.lookupEnvironment;

							try {
								IJavaProject project = ((SourceTypeElementInfo) sourceTypes[0]).getHandle().getJavaProject();
								this.options.complianceLevel = CompilerOptions.versionToJdkLevel(project.getOption(JavaCore.COMPILER_COMPLIANCE, true));
								this.options.sourceLevel = CompilerOptions.versionToJdkLevel(project.getOption(JavaCore.COMPILER_SOURCE, true));

								// need to hold onto this
								CompilationUnitDeclaration unit =
									SourceTypeConverter.buildCompilationUnit(
											sourceTypes,//sourceTypes[0] is always toplevel here
											SourceTypeConverter.FIELD_AND_METHOD // need field and methods
											| SourceTypeConverter.MEMBER_TYPE // need member types
											| SourceTypeConverter.FIELD_INITIALIZATION, // need field initialization
											environment.problemReporter,
											result);
								if (unit != null) {
									environment.buildTypeBindings(unit, accessRestriction);
									CompilationUnitDeclaration previousUnitBeingCompleted = this.lookupEnvironment.unitBeingCompleted;
									environment.completeTypeBindings(unit);
									this.lookupEnvironment.unitBeingCompleted = previousUnitBeingCompleted;
								}
							} finally {
								this.options.complianceLevel = savedComplianceLevel;
								this.options.sourceLevel = savedSourceLevel;
							}
						} else {
							super.accept(sourceTypes, packageBinding, accessRestriction);
						}
					}
			};
	}

	@Override
	protected char[] writeClassFile(ClassFile classFile, SourceFile compilationUnit, boolean isTopLevelType)
			throws CoreException {
		String fileName = new String(classFile.fileName()); // the qualified type name "p1/p2/A"
		IPath filePath = new Path(fileName);
		IContainer outputFolder = compilationUnit.sourceLocation.binaryFolder;
		IContainer container = outputFolder;
		if (filePath.segmentCount() > 1) {
			container = outputFolder.getFolder(filePath.removeLastSegments(1));
			filePath = new Path(filePath.lastSegment());
		}

		IFile file = container.getFile(filePath.addFileExtension(SuffixConstants.EXTENSION_class));
		writeClassFileContents(classFile, file, fileName, isTopLevelType, compilationUnit);
		// answer the name of the class file as in Y or Y$M
		return filePath.lastSegment().toCharArray();
	}

	@Override
	protected void writeClassFileContents(ClassFile classFile, IFile file, String qualifiedFileName,
			boolean isTopLevelType, SourceFile compilationUnit) throws CoreException {
		// skip generating .class files.
	}

	@Override
	protected void cleanOutputFolders(boolean copyBack) throws CoreException {
		// do nothing
	}

	@Override
	protected void copyExtraResourcesBack(ClasspathMultiDirectory sourceLocation, boolean deletedAll)
			throws CoreException {
		// skip copying resources
	}

	@Override
	protected void copyResource(IResource source, IResource destination) throws CoreException {
		// skip copying resources
	}
}
