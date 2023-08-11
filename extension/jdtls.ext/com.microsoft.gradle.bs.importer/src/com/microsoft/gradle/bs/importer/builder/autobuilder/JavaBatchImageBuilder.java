package com.microsoft.gradle.bs.importer.builder.autobuilder;

import java.util.ArrayList;
import java.util.LinkedHashSet;

import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.jdt.core.IMember;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.core.compiler.CategorizedProblem;
import org.eclipse.jdt.internal.compiler.ClassFile;
import org.eclipse.jdt.internal.compiler.CompilationResult;
import org.eclipse.jdt.internal.compiler.Compiler;
import org.eclipse.jdt.internal.compiler.env.ICompilationUnit;
import org.eclipse.jdt.internal.core.CompilationGroup;

import com.microsoft.gradle.bs.importer.builder.jdtbuilder.BatchImageBuilder;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.ClasspathMultiDirectory;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.CompilationParticipantResult;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.JavaBuilder;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.SourceFile;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.State;

public class JavaBatchImageBuilder extends BatchImageBuilder {
	JavaBaseImageBuilder delegateImageBuilder;
	boolean buildStarting;
	ArrayList secondaryTypes;

	public JavaBatchImageBuilder(BatchImageBuilder batchImageBuilder, boolean buildStarting,
			CompilationGroup compilationGroup) {
		super(batchImageBuilder, buildStarting, compilationGroup);
		this.delegateImageBuilder = new JavaBaseImageBuilder(((JavaBatchImageBuilder) batchImageBuilder).javaBuilder, buildStarting, ((JavaBatchImageBuilder) batchImageBuilder).newState, compilationGroup) {
			@Override
			public void writeClassFileContents(ClassFile classFile, IFile file, String qualifiedFileName,
					boolean isTopLevelType, SourceFile compilationUnit) throws CoreException {
				JavaBatchImageBuilder.this.writeClassFileContents(classFile, file, qualifiedFileName, isTopLevelType, compilationUnit);
			}
		};
		this.compiler = this.delegateImageBuilder.getCompiler();
		this.newState = this.delegateImageBuilder.getNewState();
		this.nameEnvironment = this.delegateImageBuilder.getNameEnvironment();
	}

	public JavaBatchImageBuilder(JavaBuilder javaBuilder, boolean buildStarting, CompilationGroup compilationGroup) {
		super(javaBuilder, buildStarting, compilationGroup);
		this.delegateImageBuilder = new JavaBaseImageBuilder(javaBuilder, buildStarting, null, compilationGroup) {
			@Override
			public void writeClassFileContents(ClassFile classFile, IFile file, String qualifiedFileName,
					boolean isTopLevelType, SourceFile compilationUnit) throws CoreException {
				JavaBatchImageBuilder.this.writeClassFileContents(classFile, file, qualifiedFileName, isTopLevelType, compilationUnit);
			}
		};
		this.compiler = this.delegateImageBuilder.getCompiler();
		this.newState = this.delegateImageBuilder.getNewState();
		this.nameEnvironment = this.delegateImageBuilder.getNameEnvironment();
	}

	@Override
	protected void addAllSourceFiles(LinkedHashSet<SourceFile> sourceFiles) throws CoreException {
		this.delegateImageBuilder.addAllSourceFiles(sourceFiles);
	}

	@Override
	protected Compiler newCompiler() {
		if (this.delegateImageBuilder == null) {
			return null;
		}
		return this.delegateImageBuilder.newCompiler();
	}

	@Override
	protected char[] writeClassFile(ClassFile classFile, SourceFile compilationUnit, boolean isTopLevelType)
			throws CoreException {
		return this.delegateImageBuilder.writeClassFile(classFile, compilationUnit, isTopLevelType);
	}

	@Override
	protected void writeClassFileContents(ClassFile classFile, IFile file, String qualifiedFileName,
			boolean isTopLevelType, SourceFile compilationUnit) throws CoreException {
		// skip generating .class files.
	}

	@Override
	public void compile(SourceFile[] units) {
		this.delegateImageBuilder.compile(units);
		this.compiledAllAtOnce = this.delegateImageBuilder.isCompiledAllAtOnce();
	}

	@Override
	protected void compile(SourceFile[] units, SourceFile[] additionalUnits, boolean compilingFirstGroup) {
		if (additionalUnits != null && this.secondaryTypes == null)
			this.secondaryTypes = new ArrayList(7);
		this.delegateImageBuilder.compile(units, additionalUnits, compilingFirstGroup);
	}

	@Override
	public void acceptResult(CompilationResult result) {
		this.delegateImageBuilder.acceptResult(result);
	}

	@Override
	public ICompilationUnit fromIFile(IFile file) {
		return this.delegateImageBuilder.fromIFile(file);
	}

	@Override
	protected void createProblemFor(IResource resource, IMember javaElement, String message, String problemSeverity) {
		this.delegateImageBuilder.createProblemFor(resource, javaElement, message, problemSeverity);
	}

	@Override
	protected void deleteGeneratedFiles(IFile[] deletedGeneratedFiles) {
		this.delegateImageBuilder.deleteGeneratedFiles(deletedGeneratedFiles);
	}

	@Override
	protected SourceFile findSourceFile(IFile file, boolean mustExist) {
		return this.delegateImageBuilder.findSourceFile(file, mustExist);
	}

	@Override
	protected void finishedWith(String sourceLocator, CompilationResult result, char[] mainTypeName,
			ArrayList definedTypeNames, ArrayList duplicateTypeNames) {
		this.delegateImageBuilder.finishedWith(sourceLocator, result, mainTypeName, definedTypeNames, duplicateTypeNames);
	}

	@Override
	protected void initializeAnnotationProcessorManager(Compiler newCompiler) {
		this.delegateImageBuilder.initializeAnnotationProcessorManager(newCompiler);
	}

	@Override
	protected RuntimeException internalException(CoreException t) {
		return this.delegateImageBuilder.internalException(t);
	}

	@Override
	protected boolean isExcludedFromProject(IPath childPath) throws JavaModelException {
		return this.delegateImageBuilder.isExcludedFromProject(childPath);
	}

	@Override
	protected CompilationParticipantResult[] notifyParticipants(SourceFile[] unitsAboutToCompile) {
		return this.delegateImageBuilder.notifyParticipants(unitsAboutToCompile);
	}

	@Override
	protected void processAnnotations(CompilationParticipantResult[] results) {
		this.delegateImageBuilder.processAnnotations(results);
	}

	@Override
	protected void recordParticipantResult(CompilationParticipantResult result) {
		this.delegateImageBuilder.recordParticipantResult(result);
	}

	@Override
	protected void storeTasksFor(SourceFile sourceFile, CategorizedProblem[] tasks) throws CoreException {
		this.delegateImageBuilder.storeTasksFor(sourceFile, tasks);
	}

	@Override
	protected void updateProblemsFor(SourceFile sourceFile, CompilationResult result) throws CoreException {
		this.delegateImageBuilder.updateProblemsFor(sourceFile, result);
	}

	@Override
	protected void updateTasksFor(SourceFile sourceFile, CompilationResult result) throws CoreException {
		this.delegateImageBuilder.updateTasksFor(sourceFile, result);
	}

	@Override
	protected void acceptSecondaryType(ClassFile classFile) {
		if (this.secondaryTypes != null)
			this.secondaryTypes.add(classFile.fileName());
		super.acceptSecondaryType(classFile);
	}

	public JavaBuilder getJavaBuilder() {
		return this.javaBuilder;
	}

	public State getNewState() {
		return this.newState;
	}

	@Override
	public void cleanUp() {
		super.cleanUp();
	}

	@Override
	protected void cleanOutputFolders(boolean copyBack) throws CoreException {
		// do nothing
	}

	public ClasspathMultiDirectory[] getSourceLocations() {
		return this.sourceLocations;
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
