package com.microsoft.gradle.bs.importer.builder;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResourceStatus;
import org.eclipse.core.resources.IncrementalProjectBuilder;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences;

import com.microsoft.gradle.bs.importer.BuildServerConnection;
import com.microsoft.gradle.bs.importer.ImporterPlugin;
import com.microsoft.gradle.bs.importer.Utils;

import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.BuildTargetIdentifier;
import ch.epfl.scala.bsp4j.CompileParams;
import ch.epfl.scala.bsp4j.CompileResult;
import ch.epfl.scala.bsp4j.StatusCode;

public class BuildServerBuilder extends IncrementalProjectBuilder {

    public static final String BUILDER_ID = "com.microsoft.gradle.bs.importer.builder.BuildServerBuilder";

    @Override
    protected IProject[] build(int kind, Map<String, String> args, IProgressMonitor monitor) throws CoreException {
        Preferences preferences = JavaLanguageServerPlugin.getPreferencesManager().getPreferences();
        if (!Utils.isBuildServerEnabled(preferences)) {
            return null;
        }

        IProject project = this.getProject();
        IPath rootPath = ProjectUtils.findBelongedWorkspaceRoot(project.getLocation());
        if (rootPath == null) {
            JavaLanguageServerPlugin.logError("Cannot find workspace root for project: " + project.getName());
            return null;
        }
        BuildServerConnection buildServer = ImporterPlugin.getBuildServerConnection(rootPath);
        if (buildServer == null) {
            JavaLanguageServerPlugin.logInfo("Skip building project: " + project.getName() + " because build server is not available.");
            return null;
        }
        List<BuildTarget> targets = Utils.getBuildTargetsByProjectUri(buildServer, project.getLocationURI());
        List<BuildTargetIdentifier> ids = targets.stream().map(BuildTarget::getId).collect(Collectors.toList());
        if (ids != null) {
            // TODO: support clean build
            CompileResult result = buildServer.buildTargetCompile(new CompileParams(ids)).join();
            if (Objects.equals(result.getStatusCode(), StatusCode.ERROR)) {
                throw new CoreException(new Status(IStatus.ERROR, ImporterPlugin.PLUGIN_ID,
                        IResourceStatus.BUILD_FAILED, "Build Failed.", null));
            }
            this.refreshOutputs(monitor);
        }
        return null;
    }

    /**
     * Refresh output folders of the project and its transitive Gradle build server dependencies.
     * Gradle can compile dependencies without invoking their Eclipse builders, so their
     * output changes must also be reflected in the workspace before this build finishes.
     */
    private void refreshOutputs(IProgressMonitor monitor) throws CoreException {
        refreshOutputs(this.getProject(), new HashSet<>(), monitor);
    }

    private void refreshOutputs(IProject project, Set<IProject> refreshedProjects, IProgressMonitor monitor) throws CoreException {
        if (!project.isAccessible() || !refreshedProjects.add(project)) {
            return;
        }
        IJavaProject javaProject = ProjectUtils.getJavaProject(project);
        if (javaProject == null) {
            return;
        }

        boolean needRefreshDefaultOutput = false;
        for (IClasspathEntry cp : javaProject.getRawClasspath()) {
            if (cp.getEntryKind() == IClasspathEntry.CPE_PROJECT) {
                IProject dependency = ResourcesPlugin.getWorkspace().getRoot().getProject(cp.getPath().lastSegment());
                if (dependency.isAccessible() && Utils.isGradleBuildServerProject(dependency)) {
                    refreshOutputs(dependency, refreshedProjects, monitor);
                }
                continue;
            }
            if (cp.getEntryKind() != IClasspathEntry.CPE_SOURCE) {
                continue;
            }

            IPath output = cp.getOutputLocation();
            if (output != null) {
                output = output.removeFirstSegments(1);
                javaProject.getProject().getFolder(output).refreshLocal(IProject.DEPTH_INFINITE, monitor);
            } else {
                needRefreshDefaultOutput = true;
            }
        }

        if (needRefreshDefaultOutput) {
            IPath relativeOutputPath = javaProject.getOutputLocation().removeFirstSegments(1);
            IFolder defaultOutput = javaProject.getProject().getFolder(relativeOutputPath);
            if (defaultOutput.exists()) {
                defaultOutput.refreshLocal(IProject.DEPTH_INFINITE, monitor);
            }
        }
    }
}
