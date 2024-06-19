package com.microsoft.gradle.bs.importer;

import java.io.File;
import java.net.URI;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;

import org.eclipse.core.internal.resources.Project;
import org.eclipse.core.internal.resources.ProjectDescription;
import org.eclipse.core.internal.resources.VariableDescription;
import org.eclipse.core.resources.ICommand;
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
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jdt.ls.core.internal.AbstractProjectImporter;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;
import org.eclipse.jdt.ls.core.internal.managers.BasicFileDetector;
import org.eclipse.jdt.ls.core.internal.managers.DigestStore;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences;
import com.microsoft.java.builder.JavaProblemChecker;
import com.microsoft.gradle.bs.importer.model.BuildServerPreferences;
import com.microsoft.gradle.bs.importer.model.Telemetry;

import ch.epfl.scala.bsp4j.BuildClientCapabilities;
import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.InitializeBuildParams;
import ch.epfl.scala.bsp4j.InitializeBuildResult;

public class GradleBuildServerProjectImporter extends AbstractProjectImporter {

    private static final String CLIENT_NAME = "jdtls";

    private static final String BSP_VERSION = "2.1.0-M4";

    private static final String SCHEMA_VERSION_KEY = "bspSchemaVersion";
    private static final String SCHEMA_VERSION = "0.1.0";

    public static final String BUILD_GRADLE_DESCRIPTOR = "build.gradle";
    public static final String BUILD_GRADLE_KTS_DESCRIPTOR = "build.gradle.kts";
    public static final String SETTINGS_GRADLE_DESCRIPTOR = "settings.gradle";
    public static final String SETTINGS_GRADLE_KTS_DESCRIPTOR = "settings.gradle.kts";
    public static final String ANDROID_MANIFEST = "AndroidManifest.xml";

    @Override
    public boolean applies(IProgressMonitor monitor) throws OperationCanceledException, CoreException {
        if (rootFolder == null) {
            return false;
        }


        if (!Utils.isBuildServerEnabled(getPreferences())) {
            return false;
        }

        // if the current root already contains Gradle Java project
        // imported by Buildship, skip the build server importer.
        for (IProject project : ProjectUtils.getGradleProjects()) {
            if (ProjectUtils.isJavaProject(project)
                    && project.getLocation().toFile().toPath().startsWith(rootFolder.toPath())) {
                Telemetry telemetry = new Telemetry("hasBuildshipJavaProject", "true");
                Utils.sendTelemetry(JavaLanguageServerPlugin.getProjectsManager().getConnection(),
                        telemetry);
                return false;
            }
        }

        if (directories == null) {
            BasicFileDetector gradleDetector = new BasicFileDetector(rootFolder.toPath(), BUILD_GRADLE_DESCRIPTOR,
                    SETTINGS_GRADLE_DESCRIPTOR, BUILD_GRADLE_KTS_DESCRIPTOR, SETTINGS_GRADLE_KTS_DESCRIPTOR)
                    .includeNested(false)
                    .addExclusions("**/build") //default gradle build dir
                    .addExclusions("**/bin");
            directories = gradleDetector.scan(monitor);
        }

        if (directories.isEmpty()) {
            return false;
        }

        for (java.nio.file.Path directory : directories) {
            // we don't support android
            BasicFileDetector androidDetector = new BasicFileDetector(directory, ANDROID_MANIFEST)
                .includeNested(false)
                .addExclusions("**/build") //default gradle build dir
                .addExclusions("**/bin");
            Collection<java.nio.file.Path> androidDirectories = androidDetector.scan(monitor);
            if (!androidDirectories.isEmpty()) {
                Telemetry telemetry = new Telemetry("hasAndroidManifest", "true");
                Utils.sendTelemetry(JavaLanguageServerPlugin.getProjectsManager().getConnection(),
                        telemetry);
                return false;
            }
        }

        Telemetry telemetry = new Telemetry("hasAndroidManifest", "false");
        Utils.sendTelemetry(JavaLanguageServerPlugin.getProjectsManager().getConnection(),
                telemetry);
        return true;
    }

    @Override
    public boolean applies(Collection<IPath> projectConfigurations, IProgressMonitor monitor)
            throws OperationCanceledException, CoreException {
        // TODO: enable this capability once the upstream experience is stable.
        return false;
        // if (rootFolder == null) {
        //     return false;
        // }


        // if (!Utils.isBuildServerEnabled(getPreferences())) {
        //     return false;
        // }

        // this.directories = findProjectPathByConfigurationName(
        //     projectConfigurations,
        //     Arrays.asList(
        //         BUILD_GRADLE_DESCRIPTOR,
        //         SETTINGS_GRADLE_DESCRIPTOR,
        //         BUILD_GRADLE_KTS_DESCRIPTOR,
        //         SETTINGS_GRADLE_KTS_DESCRIPTOR
        //     ),
        //     false /*includeNested*/
        // );

        // return !directories.isEmpty() && !importedByOtherImporters(directories);
    }

    @Override
    public void importToWorkspace(IProgressMonitor monitor) throws OperationCanceledException, CoreException {
        IPath rootPath = ResourceUtils.filePathFromURI(rootFolder.toURI().toString());
        BuildServerConnection buildServer = ImporterPlugin.getBuildServerConnection(rootPath, true);

        // for all the path in this.directories, find the out most directory which belongs
        // to rootFolder and use that directory as the root folder for the build server.
        // TODO: consider the following folder structure
        //   ROOT
        //    |-- sub1
        //    |-- sub2
        //    |-- sub3
        // if user partially selects sub1 and sub2, we should still use ROOT as the root folder
        // and only import sub1 and sub2 as projects.
        java.nio.file.Path inferredRoot = this.directories.stream()
                .filter(directory -> directory.startsWith(rootFolder.toPath()))
                .sorted((p1, p2) -> p1.getNameCount() - p2.getNameCount())
                .findFirst()
                .orElse(rootFolder.toPath());
        InitializeBuildParams params = new InitializeBuildParams(
                CLIENT_NAME,
                ImporterPlugin.getBundleVersion(),
                BSP_VERSION,
                inferredRoot.toUri().toString(),
                new BuildClientCapabilities(java.util.Collections.singletonList("java"))
        );
        BuildServerPreferences data = getBuildServerPreferences();
        params.setData(data);
        InitializeBuildResult initializeResult = buildServer.buildInitialize(params).join();
        buildServer.onBuildInitialized();
        // TODO: save the capabilities of this server

        if (monitor.isCanceled()) {
            return;
        }

        List<IProject> projects = importProjects(buildServer, monitor);
        if (projects.isEmpty()) {
            return;
        }

        GradleBuildServerBuildSupport buildSupport = new GradleBuildServerBuildSupport();
        for (IProject project : projects) {
            buildSupport.updateClasspath(buildServer, project, monitor);
        }

        // We need to add the project dependencies after the Java nature is set to all
        // the projects, which is done in 'updateClasspath(IProject, IProgressMonitor)',
        // otherwise JDT will thrown exception when adding projects as dependencies.
        for (IProject project : projects) {
            buildSupport.updateProjectDependencies(buildServer, project, monitor);
        }

        for (IProject project : projects) {
            updateConfigurationDigest(project);
        }
    }

    @Override
    public boolean isResolved(File folder) throws OperationCanceledException, CoreException {
        // TOOD: Once the upstream GradleProjectImporter has been updated to not import when
        // the gradle project has already imported by other importers, we can modify this logic
        // so that Maven importer can be involved for other projects.
        for (IProject project : ProjectUtils.getAllProjects()) {
            if (Utils.isGradleBuildServerProject(project) &&
                    project.getLocation().toPath().startsWith(folder.toPath())) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void reset() {
        // do nothing
    }

    /**
     * Update the digest of the gradle configuration file. Return <code>true</code> if
     * the digest is updated, <code>false</code> otherwise.
     * @throws CoreException
     */
    public static boolean updateConfigurationDigest(IProject project) {
        DigestStore digestStore = ImporterPlugin.getDigestStore();
        boolean result = false;
        try {
            File buildFile = project.getFile(BUILD_GRADLE_DESCRIPTOR).getLocation().toFile();
            result = (buildFile.exists() && digestStore.updateDigest(buildFile.toPath())) || result;

            File settingsFile = project.getFile(SETTINGS_GRADLE_DESCRIPTOR).getLocation().toFile();
            result = (settingsFile.exists() && digestStore.updateDigest(settingsFile.toPath())) || result;

            File buildKtsFile = project.getFile(BUILD_GRADLE_KTS_DESCRIPTOR).getLocation().toFile();
            result = (buildKtsFile.exists() && digestStore.updateDigest(buildKtsFile.toPath())) || result;

            File settingsKtsFile = project.getFile(SETTINGS_GRADLE_KTS_DESCRIPTOR).getLocation().toFile();
            result = (settingsKtsFile.exists() && digestStore.updateDigest(settingsKtsFile.toPath())) || result;
        } catch (CoreException e) {
            JavaLanguageServerPlugin.logException("Failed to update digest for Gradle configuration file", e);
        }

        return result;
    }

    /**
     * Return false if any of the input folder has already been imported as a
     * Java project by other importer.
     */
    private boolean importedByOtherImporters(Collection<java.nio.file.Path> directories) {
        return directories.stream()
            .map(directory -> ProjectUtils.getProjectFromUri(directory.toUri().toString()))
            .anyMatch(project -> !Utils.isGradleBuildServerProject(project) &&
                    ProjectUtils.isJavaProject(project)
            );
    }

    /**
     * Import the projects according to the available build targets. If a build target
     * maps to a project that is already imported by other importer
     *
     * @throws CoreException
     */
    private List<IProject> importProjects(BuildServerConnection buildServer, IProgressMonitor monitor) throws CoreException {
        Map<URI, List<BuildTarget>> buildTargetMap = Utils.getBuildTargetsMappedByProjectPath(buildServer);
        List<IProject> projects = new LinkedList<>();
        for (Entry<URI, List<BuildTarget>> entrySet : buildTargetMap.entrySet()) {
            URI uri = entrySet.getKey();
            IProject project = ProjectUtils.getProjectFromUri(uri.toString());
            if (project == null) {
                project = createProject(new File(uri), monitor);
            } else if (!project.isAccessible() || !Utils.isGradleBuildServerProject(project)) {
                // skip project already imported by other importers.
                continue;
            } else {
                updateProjectDescription(project, monitor);
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
        if (projectDescription instanceof ProjectDescription description) {
            VariableDescription variableDescription = new VariableDescription(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
            description.setVariableDescription(SCHEMA_VERSION_KEY, variableDescription);
        }
        projectDescription.setLocation(Path.fromOSString(directory.getPath()));
        projectDescription.setNatureIds(new String[]{ GradleBuildServerProjectNature.NATURE_ID });
        ICommand buildSpec = Utils.getBuildServerBuildSpec(projectDescription);
        ICommand problemReporter = projectDescription.newCommand();
        problemReporter.setBuilderName(JavaProblemChecker.BUILDER_ID);
        projectDescription.setBuildSpec(new ICommand[]{ problemReporter, buildSpec});
        IProject project = workspace.getRoot().getProject(projectName);
        project.create(projectDescription, monitor);

        project.open(IResource.NONE, monitor);
        return project;
    }

    private void updateProjectDescription(IProject project, IProgressMonitor monitor) throws CoreException {
        SubMonitor progress = SubMonitor.convert(monitor, 1);
        IProjectDescription projectDescription = project.getDescription();
        Utils.removeBuildshipConfigurations(projectDescription);

        ICommand problemReporter = projectDescription.newCommand();
        problemReporter.setBuilderName(JavaProblemChecker.BUILDER_ID);
        Utils.addBuildSpec(projectDescription, new ICommand[] {
            Utils.getBuildServerBuildSpec(projectDescription),
            problemReporter
        });
        project.setDescription(projectDescription, IResource.AVOID_NATURE_CONFIG, progress.newChild(1));

        // Here we don't use the public API: {@code project.setDescription()} to update the project,
        // because that API will ignore the variable descriptions.
        if (project instanceof Project internalProject) {
            ProjectDescription description = internalProject.internalGetDescription();
            VariableDescription variableDescription = new VariableDescription(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
            boolean changed = description.setVariableDescription(SCHEMA_VERSION_KEY, variableDescription);
            if (changed) {
                internalProject.writeDescription(IResource.NONE);
            }
        }
    }

    private String findFreeProjectName(String baseName) {
        IProject project = Arrays.stream(ProjectUtils.getAllProjects())
                .filter(p -> p.getName().equals(baseName)).findFirst().orElse(null);
        return project != null ? findFreeProjectName(baseName + "_") : baseName;
    }

    private BuildServerPreferences getBuildServerPreferences() {
        BuildServerPreferences pref = new BuildServerPreferences();
        Preferences jdtlsPreferences = getPreferences();
        pref.setWrapperEnabled(jdtlsPreferences.isGradleWrapperEnabled());
        pref.setGradleArguments(jdtlsPreferences.getGradleArguments());
        pref.setGradleHome(jdtlsPreferences.getGradleHome());
        pref.setGradleJavaHome(jdtlsPreferences.getGradleJavaHome());
        pref.setGradleJvmArguments(jdtlsPreferences.getGradleJvmArguments());
        pref.setGradleUserHome(jdtlsPreferences.getGradleUserHome());
        pref.setGradleVersion(jdtlsPreferences.getGradleVersion());
        pref.setJdks(EclipseVmUtil.getAllVmInstalls());
        return pref;
    }
}
