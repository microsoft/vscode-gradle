package com.microsoft.java.builder;

import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.jdt.internal.compiler.util.SimpleLookupTable;
import org.eclipse.jdt.internal.core.CompilationGroup;
import org.eclipse.jdt.internal.core.JavaProject;

import com.microsoft.java.builder.jdtbuilder.BatchImageBuilder;
import com.microsoft.java.builder.jdtbuilder.BuildNotifier;
import com.microsoft.java.builder.jdtbuilder.IncrementalImageBuilder;
import com.microsoft.java.builder.jdtbuilder.JavaBuilder;
import com.microsoft.java.builder.jdtbuilder.NameEnvironment;

public class JavaProblemChecker extends JavaBuilder {
    public static final String BUILDER_ID = "java.bs.JavaProblemChecker";

	protected BatchImageBuilder createBatchImageBuilder(BatchImageBuilder batchImageBuilder, boolean buildStarting,
			CompilationGroup group) {
		return new JavaBatchImageBuilder(batchImageBuilder, buildStarting, group);
	}

	protected BatchImageBuilder createBatchImageBuilder(JavaBuilder javaBuilder, boolean buildStarting,
			CompilationGroup group) {
		return new JavaBatchImageBuilder(javaBuilder, buildStarting, group);
	}

	protected IncrementalImageBuilder createIncrementalImageBuilder(JavaBuilder builder) {
		return new JavaIncrementalImageBuilder(builder);
	}

	protected void cleanOutputFolders() throws CoreException {
		// do nothing
	}

	protected NameEnvironment createNameEnvironment(IWorkspaceRoot root, JavaProject javaProject,
			SimpleLookupTable binaryLocationsPerProject, BuildNotifier notifier, CompilationGroup compilationGroup)
			throws CoreException {
		return new JavaNameEnvironment(root, javaProject, binaryLocationsPerProject, notifier, compilationGroup);
	}
}
