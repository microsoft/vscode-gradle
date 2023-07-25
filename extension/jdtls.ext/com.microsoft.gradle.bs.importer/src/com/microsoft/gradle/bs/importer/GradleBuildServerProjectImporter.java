package com.microsoft.gradle.bs.importer;

import static org.eclipse.jdt.ls.core.internal.handlers.MapFlattener.getValue;

import java.nio.file.Path;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.OperationCanceledException;
import org.eclipse.jdt.ls.core.internal.AbstractProjectImporter;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;
import org.eclipse.jdt.ls.core.internal.managers.BasicFileDetector;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences;

import ch.epfl.scala.bsp4j.BuildClientCapabilities;
import ch.epfl.scala.bsp4j.BuildServer;
import ch.epfl.scala.bsp4j.InitializeBuildParams;
import ch.epfl.scala.bsp4j.InitializeBuildResult;

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

        for (Path directory : directories) {
            IProject project = ProjectUtils.getProjectFromUri(directory.toUri().toString());
            // only import when the project is not imported by other importer before.
            if (project == null) {
                return true;
            }

            if (Utils.isGradleBuildServerProject(project)) {
                return true;
            }
        }

        return false;
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
        // TODO: get build targets and import to Eclipse projects
    }

    @Override
    public void reset() {
        // do nothing
    }

}
