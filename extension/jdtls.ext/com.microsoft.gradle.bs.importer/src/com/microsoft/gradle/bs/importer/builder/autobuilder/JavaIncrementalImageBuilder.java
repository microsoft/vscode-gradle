package com.microsoft.gradle.bs.importer.builder.autobuilder;

import java.util.ArrayList;
import java.util.LinkedHashSet;

import org.eclipse.core.resources.IContainer;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.Path;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IMember;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.core.compiler.CategorizedProblem;
import org.eclipse.jdt.internal.compiler.ClassFile;
import org.eclipse.jdt.internal.compiler.CompilationResult;
import org.eclipse.jdt.internal.compiler.Compiler;
import org.eclipse.jdt.internal.compiler.env.ICompilationUnit;
import org.eclipse.jdt.internal.core.ClasspathEntry;
import org.eclipse.jdt.internal.core.CompilationGroup;
import org.eclipse.jdt.internal.core.ExternalFoldersManager;
import org.eclipse.jdt.internal.core.JavaModelManager;
import org.eclipse.jdt.internal.core.JavaProject;

import com.microsoft.gradle.bs.importer.builder.jdtbuilder.CompilationParticipantResult;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.IncrementalImageBuilder;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.JavaBuilder;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.SourceFile;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.State;
import com.microsoft.gradle.bs.importer.builder.jdtbuilder.StringSet;

public class JavaIncrementalImageBuilder extends IncrementalImageBuilder {
	JavaBaseImageBuilder delegateImageBuilder;

	public JavaIncrementalImageBuilder(JavaBatchImageBuilder batchBuilder, CompilationGroup compilationGroup) {
		super(batchBuilder, compilationGroup);
		this.delegateImageBuilder = new JavaBaseImageBuilder(batchBuilder.getJavaBuilder(), true, batchBuilder.getNewState(), compilationGroup) {
			@Override
			public void writeClassFileContents(ClassFile classfile, IFile file, String qualifiedFileName,
					boolean isTopLevelType, SourceFile compilationUnit) throws CoreException {
				JavaIncrementalImageBuilder.this.writeClassFileContents(classfile, file, qualifiedFileName, isTopLevelType, compilationUnit);
			}

			@Override
			public void updateProblemsFor(SourceFile sourceFile, CompilationResult result) throws CoreException {
				JavaIncrementalImageBuilder.this.updateProblemsFor(sourceFile, result);
			}
		};
		this.compiler = this.delegateImageBuilder.getCompiler();
		this.newState = this.delegateImageBuilder.getNewState();
		this.nameEnvironment = this.delegateImageBuilder.getNameEnvironment();
	}

	public JavaIncrementalImageBuilder(JavaBuilder javaBuilder, State buildState, CompilationGroup compilationGroup) {
		super(javaBuilder, buildState, compilationGroup);
		this.delegateImageBuilder = new JavaBaseImageBuilder(javaBuilder, true, buildState, compilationGroup) {
			@Override
			public void writeClassFileContents(ClassFile classfile, IFile file, String qualifiedFileName,
					boolean isTopLevelType, SourceFile compilationUnit) throws CoreException {
				JavaIncrementalImageBuilder.this.writeClassFileContents(classfile, file, qualifiedFileName, isTopLevelType, compilationUnit);
			}

			@Override
			public void updateProblemsFor(SourceFile sourceFile, CompilationResult result) throws CoreException {
				JavaIncrementalImageBuilder.this.updateProblemsFor(sourceFile, result);
			}
		};
		this.compiler = this.delegateImageBuilder.getCompiler();
		this.newState = this.delegateImageBuilder.getNewState();
		this.nameEnvironment = this.delegateImageBuilder.getNameEnvironment();
	}

	public JavaIncrementalImageBuilder(JavaBuilder javaBuilder) {
		this(javaBuilder, null, CompilationGroup.MAIN);
		this.newState.copyFrom(javaBuilder.lastState);
	}

	@Override
	protected void writeClassFileContents(ClassFile classfile, IFile file, String qualifiedFileName,
			boolean isTopLevelType, SourceFile compilationUnit) throws CoreException {
		if (isTopLevelType) {
			addDependentsOf(new Path(qualifiedFileName), true);
			this.newState.wasStructurallyChanged(qualifiedFileName);
		}
	}

	@Override
	protected void removeClassFile(IPath typePath, IContainer outputFolder) throws CoreException {
		if (typePath.lastSegment().indexOf('$') == -1) {
			this.newState.removeQualifiedTypeName(typePath.toString());
			// add dependents even when the type thinks it does not exist to be on the safe side
			if (JavaBuilder.DEBUG)
				System.out.println("Found removed type " + typePath); //$NON-NLS-1$
			addDependentsOf(typePath, true); // when member types are removed, their enclosing type is structurally changed
			this.newState.wasStructurallyChanged(typePath.toString());
		}
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
	protected void compile(SourceFile[] units) {
		this.delegateImageBuilder.compile(units);
		this.compiledAllAtOnce = this.delegateImageBuilder.isCompiledAllAtOnce();
	}

	@Override
	protected void compile(SourceFile[] units, SourceFile[] additionalUnits, boolean compilingFirstGroup) {
		if (compilingFirstGroup && additionalUnits != null) {
			// add any source file from additionalUnits to units if it defines secondary types
			// otherwise its possible during testing with MAX_AT_ONCE == 1 that a secondary type
			// can cause an infinite loop as it alternates between not found and defined, see bug 146324
			ArrayList extras = null;
			for (int i = 0, l = additionalUnits.length; i < l; i++) {
				SourceFile unit = additionalUnits[i];
				if (unit != null && this.newState.getDefinedTypeNamesFor(unit.resource.getProjectRelativePath().toString()) != null) {
					if (JavaBuilder.DEBUG)
						System.out.println("About to compile file with secondary types "+ unit.resource.getProjectRelativePath().toString()); //$NON-NLS-1$
					if (extras == null)
						extras = new ArrayList(3);
					extras.add(unit);
				}
			}
			if (extras != null) {
				int oldLength = units.length;
				int toAdd = extras.size();
				System.arraycopy(units, 0, units = new SourceFile[oldLength + toAdd], 0, oldLength);
				for (int i = 0; i < toAdd; i++)
					units[oldLength++] = (SourceFile) extras.get(i);
			}
		}
		this.delegateImageBuilder.compile(units, additionalUnits, compilingFirstGroup);
	}

	@Override
	public void acceptResult(CompilationResult result) {
		this.delegateImageBuilder.acceptResult(result);
	}

	@Override
	protected void acceptSecondaryType(ClassFile classFile) {
		this.delegateImageBuilder.acceptSecondaryType(classFile);
	}

	@Override
	protected void copyResource(IResource source, IResource destination) throws CoreException {
		this.delegateImageBuilder.copyResource(source, destination);
	}

	@Override
	protected void createProblemFor(IResource resource, IMember javaElement, String message, String problemSeverity) {
		this.delegateImageBuilder.createProblemFor(resource, javaElement, message, problemSeverity);
	}

	@Override
	protected SourceFile findSourceFile(IFile file, boolean mustExist) {
		return this.delegateImageBuilder.findSourceFile(file, mustExist);
	}

	@Override
	protected IContainer createFolder(IPath packagePath, IContainer outputFolder) throws CoreException {
		return this.delegateImageBuilder.createFolder(packagePath, outputFolder);
	}

	@Override
	public ICompilationUnit fromIFile(IFile file) {
		return this.delegateImageBuilder.fromIFile(file);
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
	protected void storeProblemsFor(SourceFile sourceFile, CategorizedProblem[] problems) throws CoreException {
		this.delegateImageBuilder.storeProblemsFor(sourceFile, problems);
	}

	@Override
	protected void storeTasksFor(SourceFile sourceFile, CategorizedProblem[] tasks) throws CoreException {
		this.delegateImageBuilder.storeTasksFor(sourceFile, tasks);
	}

	public State getNewState() {
		return this.newState;
	}

	private IProject[] getRequiredProjects(boolean includeBinaryPrerequisites) {
		if (this.javaBuilder.javaProject == null || this.javaBuilder.workspaceRoot == null) return new IProject[0];

		LinkedHashSet<IProject> projects = new LinkedHashSet<>();
		ExternalFoldersManager externalFoldersManager = JavaModelManager.getExternalManager();
		try {
			IClasspathEntry[] entries = this.javaBuilder.javaProject.getExpandedClasspath();
			for (IClasspathEntry entry : entries) {
				IPath path = entry.getPath();
				IProject p = null;
				switch (entry.getEntryKind()) {
					case IClasspathEntry.CPE_PROJECT :
						p = this.javaBuilder.workspaceRoot.getProject(path.lastSegment()); // missing projects are considered too
						if (((ClasspathEntry) entry).isOptional() && !JavaProject.hasJavaNature(p)) // except if entry is optional
							p = null;
						break;
					case IClasspathEntry.CPE_LIBRARY :
						if (includeBinaryPrerequisites && path.segmentCount() > 0) {
							// some binary resources on the class path can come from projects that are not included in the project references
							IResource resource = this.javaBuilder.workspaceRoot.findMember(path.segment(0));
							if (resource instanceof IProject) {
								p = (IProject) resource;
							} else {
								resource = externalFoldersManager.getFolder(path);
								if (resource != null)
									p = resource.getProject();
							}
						}
				}
				if (p != null && !projects.contains(p))
					projects.add(p);
			}
		} catch(JavaModelException e) {
			return new IProject[0];
		}
		IProject[] result = new IProject[projects.size()];
		projects.toArray(result);
		return result;
	}

	protected void findAffectedSourceFilesFromRequiredProjects() {
		IProject[] requiredProjects = getRequiredProjects(false);
		if (requiredProjects == null || requiredProjects.length == 0)
			return;
		for (IProject requiredProject : requiredProjects) {
			if (JavaBuilder.DEBUG)
				System.out.println("About to find affected source files from required project "+ requiredProject.getName());
			StringSet structurallyChangedTypes = this.newState.getStructurallyChangedTypes(this.javaBuilder.getLastState(requiredProject));
			if (structurallyChangedTypes == null) {
				continue;
			}
			for (String typePath : structurallyChangedTypes.values) {
				if (typePath != null) {
					addDependentsOf(Path.forPosix(typePath), false);
				}
			}
		}
	}
}
