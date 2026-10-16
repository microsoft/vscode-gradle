package com.microsoft.gradle.bs.importer.builder;

import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IWorkspace;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.core.runtime.Path;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.MockedStatic;

import com.microsoft.gradle.bs.importer.Utils;

public class BuildServerBuilderTest {

    private static final IPath MAIN_OUTPUT = new Path("build/classes/java/main");
    private static final IPath TEST_OUTPUT = new Path("build/classes/java/test");

    private final IProgressMonitor monitor = new NullProgressMonitor();
    private final IWorkspaceRoot root = mock(IWorkspaceRoot.class);
    private MockedStatic<ResourcesPlugin> resources;
    private MockedStatic<ProjectUtils> projectUtils;
    private MockedStatic<Utils> utils;

    @Before
    public void setUp() {
        IWorkspace workspace = mock(IWorkspace.class);
        when(workspace.getRoot()).thenReturn(root);
        resources = mockStatic(ResourcesPlugin.class);
        resources.when(ResourcesPlugin::getWorkspace).thenReturn(workspace);
        projectUtils = mockStatic(ProjectUtils.class);
        utils = mockStatic(Utils.class);
    }

    @After
    public void tearDown() {
        utils.close();
        projectUtils.close();
        resources.close();
    }

    @Test
    public void refreshesTransitiveDependencyOutputsIncludingSeparateSourceOutputs() throws Exception {
        IJavaProject app = project("app");
        IJavaProject lib = project("lib");
        IJavaProject shared = project("shared");
        classpath(app, source(null), dependency("lib"));
        classpath(lib,
            source(new Path("/lib").append(MAIN_OUTPUT)),
            source(new Path("/lib").append(TEST_OUTPUT)),
            dependency("shared")
        );
        IFolder testOutput = mock(IFolder.class);
        when(lib.getProject().getFolder(TEST_OUTPUT)).thenReturn(testOutput);

        refreshOutputs(app);

        verify(mainOutput(app)).refreshLocal(IResource.DEPTH_INFINITE, monitor);
        verify(mainOutput(lib)).refreshLocal(IResource.DEPTH_INFINITE, monitor);
        verify(testOutput).refreshLocal(IResource.DEPTH_INFINITE, monitor);
        verify(mainOutput(shared)).refreshLocal(IResource.DEPTH_INFINITE, monitor);
    }

    @Test
    public void refreshesSharedDependenciesOnceAndTerminatesCycles() throws Exception {
        IJavaProject app = project("app");
        IJavaProject lib = project("lib");
        IJavaProject other = project("other");
        IJavaProject shared = project("shared");
        classpath(app, source(null), dependency("lib"), dependency("other"));
        classpath(lib, source(null), dependency("shared"));
        classpath(other, source(null), dependency("shared"));
        classpath(shared, source(null), dependency("app"));

        refreshOutputs(app);

        for (IJavaProject project : new IJavaProject[] {app, lib, other, shared}) {
            verify(mainOutput(project)).refreshLocal(IResource.DEPTH_INFINITE, monitor);
            verify(project).getRawClasspath();
        }
    }

    @Test
    public void skipsClosedNonGradleAndNonJavaDependencies() throws Exception {
        IJavaProject app = project("app");
        IJavaProject closed = project("closed");
        IJavaProject nonGradle = project("nonGradle");
        IJavaProject nonJava = project("nonJava");
        classpath(app, source(null), dependency("closed"), dependency("nonGradle"), dependency("nonJava"));
        when(closed.getProject().isAccessible()).thenReturn(false);
        IProject nonGradleProject = nonGradle.getProject();
        utils.when(() -> Utils.isGradleBuildServerProject(nonGradleProject)).thenReturn(false);
        IProject nonJavaProject = nonJava.getProject();
        projectUtils.when(() -> ProjectUtils.getJavaProject(nonJavaProject)).thenReturn(null);

        refreshOutputs(app);

        verify(mainOutput(app)).refreshLocal(IResource.DEPTH_INFINITE, monitor);
        for (IJavaProject project : new IJavaProject[] {closed, nonGradle, nonJava}) {
            verify(mainOutput(project), never()).refreshLocal(IResource.DEPTH_INFINITE, monitor);
        }
    }

    @Test
    public void propagatesDependencyRefreshFailures() throws Exception {
        IJavaProject app = project("app");
        IJavaProject lib = project("lib");
        classpath(app, source(null), dependency("lib"));
        CoreException failure = new CoreException(Status.error("Cannot refresh dependency output"));
        IFolder output = mainOutput(lib);
        doThrow(failure).when(output).refreshLocal(IResource.DEPTH_INFINITE, monitor);

        assertSame(failure, assertThrows(CoreException.class, () -> refreshOutputs(app)));
    }

    private IJavaProject project(String name) throws Exception {
        IProject project = mock(IProject.class);
        when(project.isAccessible()).thenReturn(true);
        when(root.getProject(name)).thenReturn(project);
        IJavaProject javaProject = mock(IJavaProject.class);
        when(javaProject.getProject()).thenReturn(project);
        classpath(javaProject, source(null));
        when(javaProject.getOutputLocation()).thenReturn(new Path("/" + name).append(MAIN_OUTPUT));
        IFolder output = mock(IFolder.class);
        when(output.exists()).thenReturn(true);
        when(project.getFolder(MAIN_OUTPUT)).thenReturn(output);
        projectUtils.when(() -> ProjectUtils.getJavaProject(project)).thenReturn(javaProject);
        utils.when(() -> Utils.isGradleBuildServerProject(project)).thenReturn(true);
        return javaProject;
    }

    private IClasspathEntry source(IPath output) {
        IClasspathEntry entry = mock(IClasspathEntry.class);
        when(entry.getEntryKind()).thenReturn(IClasspathEntry.CPE_SOURCE);
        when(entry.getOutputLocation()).thenReturn(output);
        return entry;
    }

    private IClasspathEntry dependency(String name) {
        IClasspathEntry entry = mock(IClasspathEntry.class);
        when(entry.getEntryKind()).thenReturn(IClasspathEntry.CPE_PROJECT);
        when(entry.getPath()).thenReturn(new Path("/" + name));
        return entry;
    }

    private void classpath(IJavaProject project, IClasspathEntry... entries) throws CoreException {
        when(project.getRawClasspath()).thenReturn(entries);
    }

    private IFolder mainOutput(IJavaProject project) {
        return project.getProject().getFolder(MAIN_OUTPUT);
    }

    private void refreshOutputs(IJavaProject project) throws Exception {
        BuildServerBuilder builder = mock(BuildServerBuilder.class, CALLS_REAL_METHODS);
        IProject workspaceProject = project.getProject();
        doReturn(workspaceProject).when(builder).getProject();
        Method method = BuildServerBuilder.class.getDeclaredMethod("refreshOutputs", IProgressMonitor.class);
        method.setAccessible(true);
        try {
            method.invoke(builder, monitor);
        } catch (InvocationTargetException e) {
            if (e.getCause() instanceof CoreException cause) {
                throw cause;
            }
            throw e;
        }
    }
}
