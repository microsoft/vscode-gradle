/*******************************************************************************
 * Copyright (c) 2023 Gradle Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copied from org.eclipse.buildship.core/src/main/java/org/eclipse/buildship/core/internal/workspace/EclipseVmUtil.java
 *
 * Contributors:
 *     Microsoft Corporation - Get compatible VM with highest version.
 ******************************************************************************/

package com.microsoft.gradle.bs.importer;

import java.io.File;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.internal.compiler.impl.CompilerOptions;
import org.eclipse.jdt.internal.launching.StandardVMType;
import org.eclipse.jdt.launching.AbstractVMInstall;
import org.eclipse.jdt.launching.IVMInstall;
import org.eclipse.jdt.launching.IVMInstall2;
import org.eclipse.jdt.launching.IVMInstallType;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.launching.VMStandin;
import org.eclipse.jdt.launching.environments.IExecutionEnvironment;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.RuntimeEnvironment;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences;

public class EclipseVmUtil {

    private static final String VM_ID_PREFIX = "com.microsoft.gradle.bs.vm.";

    /**
     * Finds a Java VM in the Eclipse VM registry. It will first find the expected version,
     * If it is not available, Then it will search the highest version among
     * [{@code lowestVersion}, {@code highestVersion}].
     *
     * If no valid JDK can be found, registers a new one specified by {@code location}, which is
     * the one used to launch the Gradle Daemon.
     *
     * @param expectedVersion the expected Java version
     * @param lowestVersion  the lowest supported Java version
     * @param highestVersion the highest supported Java version
     * @param location the location of the VM
     * @return the reference of an existing or newly created VM
     */
    public static IVMInstall findOrRegisterStandardVM(String expectedVersion, String lowestVersion,
            String highestVersion, File location) {
        Optional<IVMInstall> vm = findRegisteredVM(expectedVersion, lowestVersion, highestVersion);
        return vm.isPresent() ? vm.get() : registerNewVM(location);
    }

    private static Optional<IVMInstall> findRegisteredVM(String expectedVersion, String lowestVersion,
            String highestVersion) {
        Optional<IExecutionEnvironment> possibleExecutionEnvironment = findExecutionEnvironment(lowestVersion);
        if (!possibleExecutionEnvironment.isPresent()) {
            return Optional.empty();
        }

        IExecutionEnvironment executionEnvironment = possibleExecutionEnvironment.get();
        IVMInstall vm = getCompatibleVMWithHighestVersion(expectedVersion, lowestVersion,
                highestVersion, executionEnvironment);
        return Optional.ofNullable(vm);
    }

    private static IVMInstall getCompatibleVMWithHighestVersion(String expectedVersion, String lowestVersion,
            String highestVersion, IExecutionEnvironment executionEnvironment) {
        IVMInstall vm = null;
        IVMInstall[] compatibleVMs = executionEnvironment.getCompatibleVMs();
        for (IVMInstall compatibleVm : compatibleVMs) {
            File installLocation = compatibleVm.getInstallLocation();
            if (installLocation == null || !installLocation.exists() || isEmbeddedJre(installLocation.getAbsolutePath())) {
                continue;
            }

            if (compatibleVm instanceof IVMInstall2 vm2) {
                String javaVersion = vm2.getJavaVersion();

                if (javaVersion == null) {
                    continue;
                }

                if (JavaCore.compareJavaVersions(javaVersion, expectedVersion) == 0) {
                    return compatibleVm;
                }

                if ((lowestVersion != null && JavaCore.compareJavaVersions(lowestVersion, javaVersion) > 0)
                        || (highestVersion != null && JavaCore.compareJavaVersions(highestVersion, javaVersion) < 0)) {
                    continue;
                }

                if (vm == null || JavaCore.compareJavaVersions(
                        ((IVMInstall2)vm).getJavaVersion(), javaVersion) < 0) {
                    vm = compatibleVm;
                }
            }
        }
        return vm;
    }

    /**
     * Whether the location points to the embedded JRE of Java extension.
     */
    private static boolean isEmbeddedJre(String path) {
        return path.contains("extensions") && path.contains("redhat.java") && path.contains("jre");
    }

    /**
     * Finds the execution environment for the given compliance version, e.g. 'JavaSE-1.6' for version '1.6'.
     *
     * @param version the Java version
     * @return the execution environment or {@link Optional#empty()} if none was found
     */
    public static Optional<IExecutionEnvironment> findExecutionEnvironment(String version) {
        String executionEnvironmentId = getExecutionEnvironmentId(version);
        for (IExecutionEnvironment executionEnvironment : JavaRuntime.getExecutionEnvironmentsManager().getExecutionEnvironments()) {
            if (executionEnvironment.getId().equals(executionEnvironmentId)) {
                return Optional.of(executionEnvironment);
            }
        }
        return Optional.empty();
    }

    /**
     * Get all the available JDK installations in the Eclipse VM registry. If multiple installations
     * are found for the same major version, the first found one is return.
     *
     * The results are returned as map, where key is the major version and value is the uri string of
     * the installation path.
     * <p> Note: The embedded JRE is excluded.
     */
    public static Map<String, String> getAllVmInstalls() {
        List<IVMInstall> vmList = Stream.of(JavaRuntime.getVMInstallTypes())
                        .map(IVMInstallType::getVMInstalls)
                        .flatMap(Arrays::stream)
                        .toList();
        Map<String, File> vmInstalls = new HashMap<>();
        for (IVMInstall vmInstall : vmList) {
            if (vmInstall instanceof AbstractVMInstall vm) {
                String javaVersion = getMajorJavaVersion(vm.getJavaVersion());
                if (StringUtils.isBlank(javaVersion) || vm.getInstallLocation() == null
                        || isEmbeddedJre(vm.getInstallLocation().getAbsolutePath())) {
                    continue;
                }

                vmInstalls.putIfAbsent(javaVersion, vm.getInstallLocation());
            }
        }

        Preferences preferences = JavaLanguageServerPlugin.getPreferencesManager().getPreferences();
        Set<RuntimeEnvironment> runtimes = preferences.getRuntimes();
        for (RuntimeEnvironment runtime : runtimes) {
            if (StringUtils.isBlank(runtime.getPath())) {
                continue;
            }
            File javaHome = new File(runtime.getPath());
            if (vmInstalls.containsValue(javaHome)) {
                continue;
            }

            String javaVersion = new StandardVMType().readReleaseVersion(javaHome);
            // TODO: cannot get version is release file is not present.
            if (StringUtils.isNotBlank(javaVersion)) {
                // the user preference should have higher priority and replace
                // the existing one if the major version is the same.
                vmInstalls.put(getMajorJavaVersion(javaVersion), javaHome);
            }
        }

        Map<String, String> vmInstallsUri = new HashMap<>();
        for (Map.Entry<String, File> entry : vmInstalls.entrySet()) {
            vmInstallsUri.put(entry.getKey(), entry.getValue().toURI().toString());
        }
        return vmInstallsUri;
    }

    private static String getMajorJavaVersion(String version) {
        if (version == null) {
            return null;
        }

        return CompilerOptions.versionFromJdkLevel(CompilerOptions.versionToJdkLevel(version));
    }

    private static String getExecutionEnvironmentId(String version) {
        // the result values correspond to the standard execution environment definitions in the
        // org.eclipse.jdt.launching/plugin.xml file
        if ("1.1".equals(version)) {
            return "JRE-1.1";
        } else if (Arrays.asList("1.5", "1.4", "1.3", "1.2").contains(version)) {
            return "J2SE-" + version;
        } else {
            return "JavaSE-" + version;
        }
    }

    private static IVMInstall registerNewVM(File location) {
        // use the 'Standard VM' type to register a new VM
        IVMInstallType installType = JavaRuntime.getVMInstallType(StandardVMType.ID_STANDARD_VM_TYPE);

        // both the id and the name have to be unique for the registration
        String vmId = generateUniqueVMId(installType);

        // create the VM without firing events on individual method calls
        VMStandin vm = new VMStandin(installType, vmId);

        String javaVersion = new StandardVMType().readReleaseVersion(location);
        String name = StringUtils.isBlank(javaVersion) ? "Java SE"
                : "JavaSE-" + getMajorJavaVersion(javaVersion);
        vm.setName(name);
        vm.setInstallLocation(location);
        return vm.convertToRealVM();
    }

    private static String generateUniqueVMId(IVMInstallType type) {
        // return a unique id for the VM
        int counter = 1;
        String vmId = VM_ID_PREFIX + counter;
        while (type.findVMInstall(vmId) != null) {
            counter++;
            vmId = VM_ID_PREFIX + counter;
        }
        return vmId;
    }

    private EclipseVmUtil() {
    }
}
