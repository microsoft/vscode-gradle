package com.microsoft.gradle.bs.importer;

import static org.eclipse.jdt.ls.core.internal.handlers.MapFlattener.getValue;

import java.io.File;
import java.net.URI;
import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IWorkspace;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.OperationCanceledException;
import org.eclipse.core.runtime.Path;
import org.eclipse.jdt.ls.core.internal.AbstractProjectImporter;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;
import org.eclipse.jdt.ls.core.internal.managers.BasicFileDetector;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences;

import ch.epfl.scala.bsp4j.BuildClientCapabilities;
import ch.epfl.scala.bsp4j.BuildServer;
import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.InitializeBuildParams;
import ch.epfl.scala.bsp4j.InitializeBuildResult;
import ch.epfl.scala.bsp4j.WorkspaceBuildTargetsResult;

public class GradleBuildServerProjectImporter extends AbstractProjectImporter {

    private static final String CLIENT_NAME = "jdtls";

    private static final String CLIENT_VERSION = "0.1.0";

    private static final String BSP_VERSION = "2.1.0-M4";

    public static final String BUILD_GRADLE_DESCRIPTOR = "build.gradle";
    public static final String BUILD_GRADLE_KTS_DESCRIPTOR = "build.gradle.kts";
    public static final String SETTINGS_GRADLE_DESCRIPTOR = "settings.gradle";
    public static final String SETTINGS_GRADLE_KTS_DESCRIPTOR = "settings.gradle.kts";

    private static final String JAVA_BUILD_SERVER_GRADLE_ENABLED = "java.gradle.buildServer.enabled";

    @Override
    public boolean applies(IProgressMonitor monitor) throws OperationCanceledException, CoreException {
        if (rootFolder == null) {
            return false;
        }

        Preferences preferences = getPreferences();
        if (!preferences.isImportGradleEnabled()) {
            return false;
        }

        Object bspImporterEnabled = getValue(preferences.asMap(), JAVA_BUILD_SERVER_GRADLE_ENABLED);
        if (bspImporterEnabled == null || !((boolean) bspImporterEnabled)) {
            return false;
        }

        if (directories == null) {
            BasicFileDetector gradleDetector = new BasicFileDetector(rootFolder.toPath(), BUILD_GRADLE_DESCRIPTOR,
                    SETTINGS_GRADLE_DESCRIPTOR, BUILD_GRADLE_KTS_DESCRIPTOR, SETTINGS_GRADLE_KTS_DESCRIPTOR)
                    .includeNested(false)
                    .addExclusions("**/build") //default gradle build dir
                    .addExclusions("**/bin");
            directories = gradleDetector.scan(monitor);
        }

        return !directories.isEmpty();
    }

    @Override
    public void importToWorkspace(IProgressMonitor monitor) throws OperationCanceledException, CoreException {
        IPath rootPath = ResourceUtils.filePathFromURI(rootFolder.toURI().toString());
        BuildServer buildServer = ImporterPlugin.getBuildServerConnection(rootPath);

        InitializeBuildParams params = new InitializeBuildParams(
                CLIENT_NAME,
                CLIENT_VERSION,
                BSP_VERSION,
                rootFolder.toPath().toUri().toString(),
                new BuildClientCapabilities(java.util.Collections.singletonList("java"))
        );

        // TODO: create and set preference
        InitializeBuildResult initializeResult = buildServer.buildInitialize(params).join();
        buildServer.onBuildInitialized();
        // TODO: save the capabilities of this server

        if (monitor.isCanceled()) {
            return;
        }
        WorkspaceBuildTargetsResult workspaceBuildTargetsResult = buildServer.workspaceBuildTargets().join();
        List<BuildTarget> buildTargets = workspaceBuildTargetsResult.getTargets();

        List<IProject> projects = importProjects(buildTargets, monitor);
        if (projects.isEmpty()) {
            return;
        }

        GradleBuildServerBuildSupport buildSupport = new GradleBuildServerBuildSupport();
        for (IProject project : projects) {
            buildSupport.updateClasspath(project, monitor);
        }
    }

    @Override
    public void reset() {
        // do nothing
    }

    /**
     * Import the projects according to the available build targets. If a build target
     * maps to a project that is already imported by other importer
     *
     * @param buildTargets
     * @param monitor
     * @return
     * @throws CoreException
     */
    private List<IProject> importProjects(List<BuildTarget> buildTargets, IProgressMonitor monitor) throws CoreException {
        Map<URI, List<BuildTarget>> buildTargetMap = Utils.mapBuildTargetsByProjectPath(buildTargets);
        List<IProject> projects = new LinkedList<>();
        for (Entry<URI, List<BuildTarget>> entrySet : buildTargetMap.entrySet()) {
            URI uri = entrySet.getKey();
            IProject project = ProjectUtils.getProjectFromUri(uri.toString());
            if (project == null) {
                project = createProject(new File(uri), monitor);
            } else if (!project.isAccessible() || !Utils.isGradleBuildServerProject(project)) {
                // skip project already imported by other importers.
                continue;
            }

            project.refreshLocal(IResource.DEPTH_INFINITE, monitor);
            projects.add(project);
        }
        return projects;
    }

    private IProject createProject(File directory, IProgressMonitor monitor) throws CoreException {
        String projectName = findFreeProjectName(directory.getName());
        IWorkspace workspace = ResourcesPlugin.getWorkspace();
        IProjectDescription projectDescription = workspace.newProjectDescription(projectName);
        projectDescription.setLocation(Path.fromOSString(directory.getPath()));
        projectDescription.setNatureIds(new String[]{ GradleBuildServerProjectNature.NATURE_ID });
        IProject project = workspace.getRoot().getProject(projectName);
        project.create(projectDescription, monitor);

        project.open(IResource.NONE, monitor);
        return project;
    }

    private String findFreeProjectName(String baseName) {
        IProject project = Arrays.stream(ProjectUtils.getAllProjects())
                .filter(p -> p.getName().equals(baseName)).findFirst().orElse(null);
        return project != null ? findFreeProjectName(baseName + "_") : baseName;
    }
}
