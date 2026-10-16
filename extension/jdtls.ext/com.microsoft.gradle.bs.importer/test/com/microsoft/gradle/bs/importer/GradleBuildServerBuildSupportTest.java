package com.microsoft.gradle.bs.importer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.File;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.eclipse.core.resources.IWorkspace;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IPath;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.launching.AbstractVMInstall;
import org.eclipse.jdt.launching.IVMInstall;
import org.eclipse.jdt.launching.IVMInstallType;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.launching.environments.IExecutionEnvironment;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.mockito.MockedStatic;

import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.extended.JvmBuildTargetEx;

public class GradleBuildServerBuildSupportTest {

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private final GradleBuildServerBuildSupport buildSupport = new GradleBuildServerBuildSupport();

    @Test
    public void mapsNewGradleReleaseBoundariesAndPatchVersions() throws Exception {
        String[][] cases = {
            {"8.9", "22"}, {"8.9.1", "22"}, {"8.10-rc-1", "22"},
            {"8.10", "23"}, {"8.10.1", "23"}, {"8.13", "23"}, {"8.14-rc-1", "23"},
            {"8.14", "24"}, {"8.14.1", "24"}, {"9.0.0", "24"}, {"9.1.0-rc-1", "24"},
            {"9.1.0", "25"}, {"9.1.1", "25"}, {"9.3.0", "25"}, {"9.4.0-rc-1", "25"},
            {"9.4.0", "26"}, {"9.4.1", "26"}, {"9.7.0", "26"}, {"9.8.0-rc-1", "26"},
            {"9.8.0", "27"}, {"9.8.1", "27"}
        };
        assertMappings(cases);
    }

    @Test
    public void preservesOlderGradleMappings() throws Exception {
        String[][] cases = {
            {"1.12", "1.8"}, {"2.0", "1.8"}, {"4.2", "1.8"},
            {"4.3", "9"}, {"4.6", "9"}, {"4.7", "10"}, {"4.10.3", "10"},
            {"5.0", "11"}, {"5.3", "11"}, {"5.4", "12"}, {"5.6.4", "12"},
            {"6.0", "13"}, {"6.2", "13"}, {"6.3", "14"}, {"6.6", "14"},
            {"6.7", "15"}, {"6.9.4", "15"}, {"7.0", "16"}, {"7.2", "16"},
            {"7.3", "17"}, {"7.4", "17"}, {"7.5", "18"}, {"7.6", "19"},
            {"8.2", "19"}, {"8.3", "20"}, {"8.4", "20"}, {"8.5", "21"},
            {"8.7", "21"}, {"8.8", "22"}, {"8.8.1", "22"}
        };
        assertMappings(cases);
    }

    @Test
    public void prefersExactProjectVersionOverHigherFallback() throws Exception {
        AbstractVMInstall java25 = vm("25");
        AbstractVMInstall java27 = vm("27");
        assertSame(java25, selectVm("25", "21", "27", java27, java25));
    }

    @Test
    public void preservesExactProjectVersionAboveDaemonCompatibilityBound() throws Exception {
        AbstractVMInstall java27 = vm("27");
        assertSame(java27, selectVm("27", "21", "25", vm("25"), java27));
    }

    @Test
    public void selectsHighestValidFallbackWithoutJava22Ceiling() throws Exception {
        AbstractVMInstall java27 = vm("27");
        assertSame(java27, selectVm("21", "17", highestJavaVersion("9.8.1"),
                vm("23"), java27, vm("25")));
        assertSame(java27, selectVm("21", "17", highestJavaVersion("9.8.1"),
                java27, vm("25"), vm("23")));
    }

    @Test
    public void excludesFallbacksOutsideCompatibilityBounds() throws Exception {
        AbstractVMInstall java25 = vm("25");
        assertSame(java25, selectVm("21", "17", highestJavaVersion("9.1.0"),
                vm("16"), vm("27"), java25));
        assertNull(selectVm("21", "17", "25", vm("16"), vm("27")));
    }

    @Test
    public void excludesMissingEmbeddedAndUnknownRuntimes() throws Exception {
        AbstractVMInstall missing = vm("27");
        when(missing.getInstallLocation()).thenReturn(new File(temporaryFolder.getRoot(), "missing"));
        AbstractVMInstall embedded = vm("27");
        when(embedded.getInstallLocation()).thenReturn(
                temporaryFolder.newFolder("extensions", "redhat.java", "jre"));
        AbstractVMInstall unknown = vm("27");
        when(unknown.getJavaVersion()).thenReturn(null);
        AbstractVMInstall java25 = vm("25");
        assertSame(java25, selectVm("21", "17", "27", missing, embedded, unknown, java25));
    }

    @Test
    public void importsJava27ToolchainWithJava25ServiceRuntime() throws Exception {
        AbstractVMInstall java27 = vm("27");
        assertImportedJdk("9.8.1", "25", "27", "27", java27, vm("25"), java27);
    }

    @Test
    public void importsJava27Daemon() throws Exception {
        AbstractVMInstall java27 = vm("27");
        assertImportedJdk("9.8.1", "27", "27", "27", java27, java27, vm("25"));
    }

    @Test
    public void preservesSourceAndTargetAboveDaemonCompatibilityBound() throws Exception {
        AbstractVMInstall java27 = vm("27");
        assertImportedJdk("9.1.0", "25", "27", "27", java27, vm("25"), java27);
    }

    @Test
    public void importsHighestFallbackAndPreservesDistinctSourceAndTarget() throws Exception {
        AbstractVMInstall java27 = vm("27");
        assertImportedJdk("9.8.1", "25", "21", "22", java27, vm("25"), java27);
    }

    private void assertMappings(String[][] cases) throws Exception {
        for (String[] testCase : cases) {
            assertEquals("Gradle " + testCase[0], testCase[1], highestJavaVersion(testCase[0]));
        }
    }

    private String highestJavaVersion(String gradleVersion) throws Exception {
        Method method = GradleBuildServerBuildSupport.class.getDeclaredMethod(
                "getHighestCompatibleJavaVersion", String.class);
        method.setAccessible(true);
        return (String) method.invoke(buildSupport, gradleVersion);
    }

    private AbstractVMInstall vm(String version) throws Exception {
        AbstractVMInstall vm = mock(AbstractVMInstall.class);
        when(vm.getJavaVersion()).thenReturn(version);
        when(vm.getInstallLocation()).thenReturn(temporaryFolder.newFolder());
        when(vm.getId()).thenReturn("jdk-" + version);
        when(vm.getName()).thenReturn("jdk-" + version);
        IVMInstallType type = mock(IVMInstallType.class);
        when(type.getId()).thenReturn("test.vm.type");
        when(vm.getVMInstallType()).thenReturn(type);
        return vm;
    }

    private IVMInstall selectVm(String expected, String lowest, String highest,
            IVMInstall... vms) throws Exception {
        Method method = EclipseVmUtil.class.getDeclaredMethod("getCompatibleVMWithHighestVersion",
                String.class, String.class, String.class, IExecutionEnvironment.class);
        method.setAccessible(true);
        return (IVMInstall) method.invoke(null, expected, lowest, highest, environment(vms));
    }

    private IExecutionEnvironment environment(IVMInstall... vms) {
        IExecutionEnvironment environment = mock(IExecutionEnvironment.class);
        when(environment.getCompatibleVMs()).thenReturn(vms);
        return environment;
    }

    private void assertImportedJdk(String gradleVersion, String daemonVersion, String sourceVersion,
            String targetVersion, IVMInstall expectedVm, IVMInstall... vms) throws Exception {
        File daemonHome = vms[0].getInstallLocation();
        JvmBuildTargetEx jvmTarget = new JvmBuildTargetEx(daemonHome.toURI().toString(), daemonVersion,
                gradleVersion, sourceVersion, targetVersion);
        BuildTarget buildTarget = mock(BuildTarget.class);
        when(buildTarget.getDataKind()).thenReturn("jvm");
        when(buildTarget.getData()).thenReturn(jvmTarget);
        IJavaProject javaProject = mock(IJavaProject.class);
        Map<IPath, IClasspathEntry> classpath = new HashMap<>();
        IWorkspace workspace = mock(IWorkspace.class);
        when(workspace.getRoot()).thenReturn(mock(IWorkspaceRoot.class));

        try (MockedStatic<ResourcesPlugin> resources = mockStatic(ResourcesPlugin.class);
                MockedStatic<EclipseVmUtil> vmUtil = mockStatic(EclipseVmUtil.class, CALLS_REAL_METHODS)) {
            resources.when(ResourcesPlugin::getWorkspace).thenReturn(workspace);
            IExecutionEnvironment environment = environment(vms);
            vmUtil.when(() -> EclipseVmUtil.findExecutionEnvironment(sourceVersion))
                    .thenReturn(Optional.of(environment));
            Method method = GradleBuildServerBuildSupport.class.getDeclaredMethod("setProjectJdk",
                    Map.class, List.class, IJavaProject.class, boolean.class);
            method.setAccessible(true);
            method.invoke(buildSupport, classpath, List.of(buildTarget), javaProject, false);
            vmUtil.verify(() -> EclipseVmUtil.findOrRegisterStandardVM(
                    targetVersion, sourceVersion, highestJavaVersion(gradleVersion), daemonHome));
        }

        verify(javaProject).setOption(JavaCore.COMPILER_SOURCE, sourceVersion);
        verify(javaProject).setOption(JavaCore.COMPILER_CODEGEN_TARGET_PLATFORM, targetVersion);
        verify(javaProject).setOption(JavaCore.COMPILER_COMPLIANCE, targetVersion);
        assertEquals(1, classpath.size());
        assertEquals(JavaRuntime.newJREContainerPath(expectedVm),
                classpath.values().iterator().next().getPath());
    }
}
