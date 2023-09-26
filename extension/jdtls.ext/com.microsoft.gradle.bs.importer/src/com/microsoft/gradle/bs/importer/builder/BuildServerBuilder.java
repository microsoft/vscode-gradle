package com.microsoft.gradle.bs.importer.builder;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResourceStatus;
import org.eclipse.core.resources.IncrementalProjectBuilder;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
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
        if (buildServer != null) {
            List<BuildTarget> targets = Utils.getBuildTargetsByProjectUri(buildServer, project.getLocationURI());
            List<BuildTargetIdentifier> ids = targets.stream().map(BuildTarget::getId).collect(Collectors.toList());
            if (ids != null) {
                // TODO: support clean build
                CompileResult result = buildServer.buildTargetCompile(new CompileParams(ids)).join();
                if (Objects.equals(result.getStatusCode(), StatusCode.ERROR)) {
                    throw new CoreException(new Status(IStatus.ERROR, ImporterPlugin.PLUGIN_ID,
                            IResourceStatus.BUILD_FAILED, "Build Failed.", null));
                }
            }
        }
        return null;
    }
}
