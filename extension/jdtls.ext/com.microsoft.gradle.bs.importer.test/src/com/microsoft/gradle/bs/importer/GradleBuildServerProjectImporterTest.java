package com.microsoft.gradle.bs.importer;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.IWorkspace;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.core.runtime.Path;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.preferences.PreferenceManager;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * Tests for {@link GradleBuildServerProjectImporter} in multi-root workspaces.
 *
 * jdt.ls creates a fresh importer instance for every workspace root, but
 * {@code initialize()} triggers {@code reset()} whenever the root folder
 * changes. These tests exercise that defensive guard by reusing a single
 * instance across roots: state derived from a previous root must not leak
 * into the next one.
 */
public class GradleBuildServerProjectImporterTest {

    private java.nio.file.Path gradleRoot;
    private java.nio.file.Path plainRoot;
    private PreferenceManager previousPreferenceManager;

    @Before
    public void setUp() throws Exception {
        gradleRoot = Files.createTempDirectory("importer-test-gradle").toRealPath();
        Files.createFile(gradleRoot.resolve("build.gradle"));
        plainRoot = Files.createTempDirectory("importer-test-plain").toRealPath();

        Preferences preferences = Preferences.createFrom(
                Map.<String, Object>of("java.gradle.buildServer.enabled", "on"));
        preferences.setRootPaths(List.of(
                new Path(plainRoot.toString()),
                new Path(gradleRoot.toString())));
        PreferenceManager preferenceManager = new PreferenceManager();
        preferenceManager.update(preferences);
        // PreferenceManager is global static state on JavaLanguageServerPlugin;
        // remember the previous one so tearDown() can restore it and the tests
        // stay independent of each other and of execution order.
        previousPreferenceManager = JavaLanguageServerPlugin.getPreferencesManager();
        JavaLanguageServerPlugin.setPreferencesManager(preferenceManager);
    }

    @After
    public void tearDown() throws Exception {
        JavaLanguageServerPlugin.setPreferencesManager(previousPreferenceManager);
        for (IProject project : ResourcesPlugin.getWorkspace().getRoot().getProjects()) {
            project.delete(true, true, new NullProgressMonitor());
        }
        deleteRecursively(plainRoot);
        deleteRecursively(gradleRoot);
    }

    @Test
    public void appliesToGradleRootAfterPlainRoot() throws Exception {
        GradleBuildServerProjectImporter importer = new GradleBuildServerProjectImporter();

        importer.initialize(plainRoot.toFile());
        assertFalse("importer must not apply to a root without a Gradle build",
                importer.applies(new NullProgressMonitor()));

        importer.initialize(gradleRoot.toFile());
        assertTrue("importer must apply to the Gradle root even when a plain root was visited first",
                importer.applies(new NullProgressMonitor()));
    }

    @Test
    public void doesNotApplyToPlainRootAfterGradleRoot() throws Exception {
        GradleBuildServerProjectImporter importer = new GradleBuildServerProjectImporter();

        importer.initialize(gradleRoot.toFile());
        assertTrue("importer must apply to the Gradle root",
                importer.applies(new NullProgressMonitor()));

        importer.initialize(plainRoot.toFile());
        assertFalse("importer must not reuse the Gradle root scan result for a plain root",
                importer.applies(new NullProgressMonitor()));
    }

    @Test
    public void doesNotApplyWhenMultipleRootsContainGradleBuilds() throws Exception {
        Files.createFile(plainRoot.resolve("build.gradle"));
        GradleBuildServerProjectImporter importer = new GradleBuildServerProjectImporter();

        importer.initialize(gradleRoot.toFile());
        assertFalse("importer must not apply when more than one root contains a Gradle build",
                importer.applies(new NullProgressMonitor()));
    }

    @Test
    public void resetClearsStaleUnresolvedState() throws Exception {
        IProject project = createBuildServerProject("already-imported");

        TestableImporter importer = new TestableImporter();
        importer.initialize(gradleRoot.toFile());
        // a directory outside the root folder makes the importer fail to
        // determine the build server root and mark itself unresolved
        importer.setDirectories(List.of(plainRoot));
        importer.importToWorkspace(new NullProgressMonitor());

        // switching to another root must reset the failure state
        importer.initialize(plainRoot.toFile());

        assertFalse(importer.isResolved(plainRoot.toFile()));
        assertTrue("a stale failure from a previous root must not delete imported projects",
                project.exists());
    }

    private IProject createBuildServerProject(String name) throws Exception {
        IWorkspace workspace = ResourcesPlugin.getWorkspace();
        IProjectDescription description = workspace.newProjectDescription(name);
        description.setNatureIds(new String[] { GradleBuildServerProjectNature.NATURE_ID });
        IProject project = workspace.getRoot().getProject(name);
        project.create(description, new NullProgressMonitor());
        project.open(new NullProgressMonitor());
        return project;
    }

    private static void deleteRecursively(java.nio.file.Path root) throws IOException {
        Files.walkFileTree(root, new SimpleFileVisitor<java.nio.file.Path>() {
            @Override
            public FileVisitResult visitFile(java.nio.file.Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(java.nio.file.Path dir, IOException exc) throws IOException {
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static final class TestableImporter extends GradleBuildServerProjectImporter {
        void setDirectories(Collection<java.nio.file.Path> directories) {
            this.directories = directories;
        }
    }
}
